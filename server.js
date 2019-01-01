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
    const https = require('https');
    const Koa = require('koa');
    const serve = require('koa-static');
    const app = new Koa();

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

    let respond = async (ctx, next, route) => {
        return new Promise(async resolve => {
            switch (route.type) {
                case 'static':
                    await serve(__dirname + '/www/' + route.dir)(ctx, next);
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
            ctx = await respond(ctx, next, route);
        } else {
            let startsWith = null;
            SYSTEM.hosts[hostname].starts.forEach(start => {
                if (ctx.request.path.startsWith(start.route) && start.method === ctx.request.method) {
                    startsWith = start.route;
                }
            });
            if (startsWith) {
                let route = SYSTEM.hosts[hostname].routes[startsWith][ctx.request.method];
                ctx = await respond(ctx, next, route);
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

    if (SYSTEM.servers) {
        SYSTEM.servers.forEach(server => {
            if (server.ssl) {
                https.createServer(app.callback()).listen(server.port, () => {
                    console.log('Server listening on port ' + server.port);
                });
            }
            else {
                http.createServer(app.callback()).listen(server.port, () => {
                    console.log('Server listening on port ' + server.port);
                });
            }
        });
    }

}