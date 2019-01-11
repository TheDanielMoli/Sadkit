const fs = require('fs');

let SYSTEM = JSON.parse(fs.readFileSync('./system/main.json', 'utf8'));

const cluster = require('cluster');
const isMaster = cluster.isMaster;

const { cpus }   = require('os');
const numWorkers = SYSTEM.general.workers ? SYSTEM.general.workers : cpus().length * 2;

let log = (args) => {
    return process.stdout.write(`[${+ new Date()}] - ${args}\n`)
};

if (isMaster) {

    log(`Forking ${numWorkers} workers`);
    const workers = [...Array(numWorkers)].map(_ => cluster.fork());

    cluster.on('online', (worker) => log(`Worker ${worker.process.pid} is online`));
    cluster.on('exit', (worker, exitCode) => {
        log(`Worker ${worker.process.id} exited with code ${exitCode}`);
        log(`Starting a new worker`);
        cluster.fork();
    })

} else {

    const http = require('http');
    const tls = require('tls');
    const https = require('https');
    const httpProxy = require('http-proxy');
    const mount = require('koa-mount');
    const send = require('koa-send');
    const Koa = require('koa');
    const app = new Koa();

    // static file server middleware

    const serve = (opts = {}) => {
        !opts.index && (opts.index = 'index.html');
        return async function serve(ctx, next) {
            if (ctx.method === 'GET' || ctx.method === 'HEAD') {
                try {
                    !(await send(ctx, ctx.path, opts)) && await next();
                } catch (err) {
                    if (err.status !== 404) {
                        console.log(err);
                    }
                }
            }
        }
    };

    // logger

    app.use(async (ctx, next) => {
        await next();
        const rt = ctx.response.get('X-Response-Time');
        console.log(`${ctx.method} ${ctx.url} - ${rt}`);
    });

    // x-response-time

    app.use(async (ctx, next) => {
        const start = Date.now();
        await next();
        const ms = Date.now() - start;
        ctx.set('X-Response-Time', `${ms}ms`);
    });

    // response

    let respond = async (ctx, next, route, opts = {}) => {
        return new Promise(async resolve => {
            switch (route.type) {
                case 'static':
                    if (ctx.path === opts.mount && opts.mount !== '/') {
                        ctx.redirect(opts.mount + '/');
                        resolve(ctx);
                    }
                    await mount(opts.mount, () => serve({ root: __dirname + '/www/' + route.dir })(ctx, next))(ctx, next);
                    resolve(ctx);
                    break;
                case 'json':
                    ctx.set('Content-Type', 'application/json');
                    ctx.body = route.response;
                    resolve(ctx);
                    break;
                case 'text':
                default:
                    ctx.body = route.response;
                    resolve(ctx);
            }
        })
    };

    app.use(async (ctx, next) => {
        let hostname = ctx.request.hostname;
        if (SYSTEM.aliases[hostname]) {
            hostname = SYSTEM.aliases[hostname];
            ctx.request.alias = hostname;
        }
        if (SYSTEM.redirects[hostname]) {
            if (SYSTEM.redirects[hostname][ctx.request.path]) {
                ctx.status = SYSTEM.redirects[hostname][ctx.request.path].status;
                ctx.redirect(SYSTEM.redirects[hostname][ctx.request.path].url);
                return;
            }
        }
        if (
            SYSTEM.hosts[hostname]
            &&
            SYSTEM.hosts[hostname].routes
            &&
            SYSTEM.hosts[hostname].routes[ctx.request.path]
            &&
            SYSTEM.hosts[hostname].routes[ctx.request.path][ctx.request.method]
        ) {
            let route = SYSTEM.hosts[hostname].routes[ctx.request.path][ctx.request.method];
            ctx = await respond(ctx, next, route, { mount: ctx.request.path });
        } else {
            let startsWith = null;
            SYSTEM.hosts[hostname].starts.forEach(start => {
                if (ctx.request.path.startsWith(start.route) && start.method === ctx.request.method) {
                    startsWith ? (start.route.length > startsWith.length) && (startsWith = start.route) : startsWith = start.route;
                }
            });
            if (startsWith) {
                let route = SYSTEM.hosts[hostname].routes[startsWith][ctx.request.method];
                ctx = await respond(ctx, next, route, { mount: startsWith });
            }
            else {
                next();
            }
        }
    });

    // default response

    app.use(async ctx => {
        ctx.set('Content-Type', 'application/json');
        let port = ctx.request.headers.host.split(':')[1];
        ctx.body = {
            ...SYSTEM.general.standard,
            host: ctx.request.host,
            hostname: ctx.request.hostname,
            alias: ctx.request.alias,
            port: port ? port : ( ctx.secure ? 443 : 80 ),
            path: ctx.request.path,
            ssl: ctx.secure,
            method: ctx.request.method,
            headers: ctx.request.headers
        };
    });

    let secureContext = {};
    let defaultKey = '';
    let defaultCert = '';
    let secureDir = __dirname + '/system/secure/';

    SYSTEM.secure.forEach(domain => {
        secureContext[domain] = tls.createSecureContext({
            key: domain.key ? fs.readFileSync(secureDir + domain.key.path, 'utf8') : undefined,
            cert: domain.cert ?  fs.readFileSync(secureDir + domain.cert.path, 'utf8') : undefined,
            ca: domain.ca ? fs.readFileSync(secureDir + domain.ca.path, 'utf8') : undefined, // this ca property is optional
        });
        defaultKey = secureDir + domain.key.path;
        defaultCert = secureDir + domain.cert.path;
    });

    const options = {
        SNICallback: (domain, cb) => {
            if (secureContext[domain]) {
                if (cb) {
                    cb(null, secureContext[domain]);
                } else {
                    // compatibility for older versions of node
                    return secureContext[domain];
                }
            } else {
                throw new Error('No keys/certificates for domain requested');
            }
        },
        key: fs.readFileSync(defaultKey, 'utf8'),
        cert: fs.readFileSync(defaultCert, 'utf8')
    };

    if (SYSTEM.servers) {
        SYSTEM.servers.forEach(server => {
            if (server.ssl) {
                try {
                    https.createServer(options, app.callback()).listen(server.port, () => {
                        console.log('Server listening on port ' + server.port + '. SSL enabled.');
                    });
                } catch (err) {
                    http.createServer(app.callback()).listen(server.port, () => {
                        console.log('Server listening on port ' + server.port + '. SSL disabled (certificate error).');
                    });
                }
            }
            else {
                http.createServer(app.callback()).listen(server.port, () => {
                    console.log('Server listening on port ' + server.port + '. SSL disabled.');
                });
            }
        });
    }

    if (SYSTEM.proxies) {
        SYSTEM.proxies.forEach(pr => {
            if (pr.ssl) {
                let proxy = new httpProxy({ changeOrigin: true });

                proxy.on('proxyReq', (proxyReq, req, res, options) => {
                    proxyReq.setHeader('X-Special-Proxy-Header', req.headers.host);
                });

                https
                    .createServer(options, (req, res) => {
                        // You can define here your custom logic to handle the request
                        // and then proxy the request.
                        let hostname = req.headers.host.split(':')[0];
                        if (pr.hosts && pr.hosts[hostname]) {
                            proxy.web(req, res, {
                                target: pr.hosts[hostname].ssl ? 'https' : 'http' + '://' + pr.hosts[hostname].hostname + ':' + pr.hosts[hostname].port
                            });
                        }
                        else if (pr.pass) {
                            proxy.web(req, res, {
                                target: pr.ssl ? 'https' : 'http' + '://' + req.headers.host.split(':')[0] + ':' + pr.pass
                            });
                        }
                        else {
                            res.setHeader('Content-Type', 'application/json');
                            res.end(JSON.stringify({
                                ...SYSTEM.general.standard,
                                status: "error",
                                message: "Proxy configuration error: no proxy configured for this protocol, hostname and port.",
                                hostname: hostname,
                                port: req.headers.host.split(':')[1],
                                ssl: true,
                                headers: req.headers
                            }));
                        }
                    })
                    .listen(pr.listen, () => {
                        console.log('Proxying ' + pr.listen + ' to ' + pr.pass);
                    });
            }
            else {
                let proxy = httpProxy.createProxyServer({});

                proxy.on('proxyReq', (proxyReq, req, res, options) => {
                    proxyReq.setHeader('X-Special-Proxy-Header', 'foobar');
                });

                http
                    .createServer((req, res) => {
                        // You can define here your custom logic to handle the request
                        // and then proxy the request.
                        let hostname = req.headers.host.split(':')[0];
                        if (pr.hosts && pr.hosts[hostname]) {
                            proxy.web(req, res, {
                                target: 'http://' + pr.hosts[hostname].hostname + ':' + pr.hosts[hostname].port
                            });
                        }
                        else if (pr.pass) {
                            proxy.web(req, res, {
                                target: 'http://' + req.headers.host.split(':')[0] + ':' + pr.pass
                            });
                        }
                        else {
                            res.setHeader('Content-Type', 'application/json');
                            res.end(JSON.stringify({
                                ...SYSTEM.general.standard,
                                status: "error",
                                message: "Proxy configuration error: no proxy configured for this protocol, hostname and port.",
                                hostname: hostname,
                                port: req.headers.host.split(':')[1],
                                ssl: false,
                                headers: req.headers
                            }));
                        }
                    })
                    .listen(pr.listen, () => {
                        console.log('Proxying ' + pr.listen + ' to ' + pr.pass);
                    });
            }
        });
    }

}
