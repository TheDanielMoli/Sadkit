const fs = require('fs');

let SYSTEM = {};
SYSTEM.aliases = JSON.parse(fs.readFileSync('./system/aliases.json', 'utf8'));
SYSTEM.auth = JSON.parse(fs.readFileSync('./system/auth.json', 'utf8'));
SYSTEM.dbms = JSON.parse(fs.readFileSync('./system/dbms.json', 'utf8'));
SYSTEM.general = JSON.parse(fs.readFileSync('./system/general.json', 'utf8'));
SYSTEM.hosts = JSON.parse(fs.readFileSync('./system/hosts.json', 'utf8'));
SYSTEM.proxies = JSON.parse(fs.readFileSync('./system/proxies.json', 'utf8'));
SYSTEM.redirects = JSON.parse(fs.readFileSync('./system/redirects.json', 'utf8'));
SYSTEM.secure = JSON.parse(fs.readFileSync('./system/secure.json', 'utf8'));
SYSTEM.servers = JSON.parse(fs.readFileSync('./system/servers.json', 'utf8'));

let packageJSON = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
if (SYSTEM.general.standard)
    SYSTEM.general.standard.version = packageJSON.version;

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
    const formidable = require('koa2-formidable');
    const compress = require('koa-compress');
    const passport = require('koa-passport');
    const bcrypt = require('bcryptjs');
    const jwt = require('jsonwebtoken');
    const JwtStrategy = require('passport-jwt').Strategy;
    const ExtractJwt = require('passport-jwt').ExtractJwt;
    const Koa = require('koa');

    const MongoClient = SYSTEM.dbms.active["mongodb"] ? require('mongodb').MongoClient : null;
    let mongoClient;

    const Datastore = SYSTEM.dbms.active["nedb"] ? require('nedb') : null;
    let nedbs = {};

    const app = new Koa();

    app.use(formidable());

    app.use(compress());

    app.use(passport.initialize());

    // Passport authentication strategy

    const opts = {};
    opts.jwtFromRequest = ExtractJwt.fromAuthHeaderAsBearerToken();
    // TODO set secret key
    opts.secretOrKey = 'secret';

    passport.use(new JwtStrategy(opts, (jwt_payload, done) => {
        switch (SYSTEM.auth.db.type) {
            case 'mongodb':
                const db = mongoClient.db(SYSTEM.auth.db.name);
                const collection = db.collection(jwt_payload.role);
                collection.findOne({_id: jwt_payload.id}).toArray((err, user) => {
                    if (err)
                        return done(null, false);
                    else
                        if (user) {
                            return done(null, {
                                _id: user._id,
                                username: user.username,
                                role: jwt_payload.role
                            });
                        }
                        else {
                            return done(null, false);
                        }
                });
                break;
            case 'nedb':
            default:
                nedbs[SYSTEM.auth.db.name][jwt_payload.role].findOne({_id: jwt_payload.id}, (err, user) => {
                    if (err)
                        return done(null, false);
                    else
                        if (user) {
                            return done(null, {
                                _id: user._id,
                                username: user.username,
                                role: jwt_payload.role
                            });
                        }
                        else {
                            return done(null, false);
                        }
                });
        }
    }));

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

    // mongodb database middleware

    const mongodb = (opts = {}) => {
        !opts.db && (opts.db = 'main');
        return async function mongodb(ctx, next) {
            let response = {
                agent: "Sadkit",
                db: opts.db,
                collection: opts.collection
            };
            const db = mongoClient.db(opts.db);
            const collection = db.collection(opts.collection);
            switch (opts.op) {
                case 'find':
                    await new Promise(resolve => {
                        let options = ctx.request.body;
                        !options && (options = {});
                        collection.find(options).toArray((err, docs) => {
                            if (err)
                                ctx.body = err;
                            else
                                ctx.body = {
                                    ...response,
                                    status: "success",
                                    op: "find",
                                    docs: docs
                                };
                            resolve(ctx);
                        });
                    });
                    break;
                case 'find-one':
                    await new Promise(resolve => {
                        let options = ctx.request.body;
                        !options && (options = {});
                        collection.findOne(options).toArray((err, docs) => {
                            if (err)
                                ctx.body = err;
                            else
                                ctx.body = {
                                    ...response,
                                    status: "success",
                                    op: "find-one",
                                    docs: docs
                                };
                            resolve(ctx);
                        });
                    });
                    break;
                case 'insert':
                    await new Promise(resolve => {
                        let doc = ctx.request.body;
                        !doc && (doc = {});
                        collection.insertOne(doc, (err, newDoc) => {
                            if (err)
                                ctx.body = err;
                            else
                                ctx.body = {
                                    ...response,
                                    status: "success",
                                    op: "insert",
                                    doc: newDoc
                                };
                            resolve(ctx);
                        });
                    });
                    break;
                case 'update':
                    await new Promise(resolve => {
                        let options = ctx.request.body;
                        !options && (options = {});
                        !options.query && (options.query = {});
                        !options.values && (options.values = {});
                        collection.updateMany(options.query, { $set: options.values }, (err, numReplaced) => {
                            if (err)
                                ctx.body = err;
                            else
                                ctx.body = {
                                    ...response,
                                    status: "success",
                                    op: "update",
                                    nUpdated: numReplaced
                                };
                            resolve(ctx);
                        });
                    });
                    break;
                case 'remove':
                    await new Promise(resolve => {
                        let options = ctx.request.body;
                        !options && (options = {});
                        collection.deleteMany(options, (err, numRemoved) => {
                            if (err)
                                ctx.body = err;
                            else
                                ctx.body = {
                                    ...response,
                                    status: "success",
                                    op: "remove",
                                    nRemoved: numRemoved
                                };
                            resolve(ctx);
                        });
                    });
                    break;
                case 'remove-one':
                    await new Promise(resolve => {
                        let options = ctx.request.body;
                        !options && (options = {});
                        !options.id && options._id && (options.id = options._id);
                        if (!options.id) {
                            ctx.body = {
                                ...response,
                                status: "error",
                                op: "remove-one",
                                error: "You must provide an id of the element to remove. Request payload must be a field id or _id."
                            };
                            resolve(ctx);
                        }
                        collection.deleteOne({ _id: options.id }, {}, (err, numRemoved) => {
                            if (err)
                                ctx.body = err;
                            else
                                ctx.body = {
                                    ...response,
                                    status: "success",
                                    op: "remove-one",
                                    nRemoved: numRemoved
                                };
                            resolve(ctx);
                        });
                    });
                    break;
                default:
                    ctx.body = 'No op configured for this storage route.';
            }
        }
    };

    // nedb database middleware

    const nedb = (opts = {}) => {
        !opts.db && (opts.db = 'main');
        return async function nedb(ctx, next) {
            let response = {
                agent: "Sadkit",
                db: opts.db,
                collection: opts.collection
            };
            switch(opts.op) {
                case 'find':
                    await new Promise(resolve => {
                        let options = ctx.request.body;
                        !options && (options = {});
                        nedbs[opts.db][opts.collection].find(options, (err, docs) => {
                            if (err)
                                ctx.body = err;
                            else
                                ctx.body = {
                                    ...response,
                                    status: "success",
                                    op: "find",
                                    docs: docs
                                };
                            resolve(ctx);
                        });
                    });
                    break;
                case 'find-one':
                    await new Promise(resolve => {
                        let options = ctx.request.body;
                        !options && (options = {});
                        nedbs[opts.db][opts.collection].findOne(options, (err, docs) => {
                            if (err)
                                ctx.body = err;
                            else
                                ctx.body = {
                                    ...response,
                                    status: "success",
                                    op: "find-one",
                                    doc: docs
                                };
                            resolve(ctx);
                        });
                    });
                    break;
                case 'insert':
                    await new Promise(resolve => {
                        let doc = ctx.request.body;
                        !doc && (doc = {});
                        nedbs[opts.db][opts.collection].insert(doc, (err, newDoc) => {
                            if (err)
                                ctx.body = err;
                            else
                                ctx.body = {
                                    ...response,
                                    status: "success",
                                    op: "insert",
                                    doc: newDoc
                                };
                            resolve(ctx);
                        });
                    });
                    break;
                case 'update':
                    await new Promise(resolve => {
                        let options = ctx.request.body;
                        !options && (options = {});
                        !options.query && (options.query = {});
                        !options.values && (options.values = {});
                        nedbs[opts.db][opts.collection].update(options.query, { $set: options.values }, { multi: true }, (err, numReplaced) => {
                            if (err)
                                ctx.body = err;
                            else
                                ctx.body = {
                                    ...response,
                                    status: "success",
                                    op: "update",
                                    nUpdated: numReplaced
                                };
                            resolve(ctx);
                        });
                    });
                    break;
                case 'remove':
                    await new Promise(resolve => {
                        let options = ctx.request.body;
                        !options && (options = {});
                        nedbs[opts.db][opts.collection].remove(options, { multi: true }, (err, numRemoved) => {
                            if (err)
                                ctx.body = err;
                            else
                                ctx.body = {
                                    ...response,
                                    status: "success",
                                    op: "remove",
                                    nRemoved: numRemoved
                                };
                            resolve(ctx);
                        });
                    });
                    break;
                case 'remove-one':
                    await new Promise(resolve => {
                        let options = ctx.request.body;
                        !options && (options = {});
                        !options.id && options._id && (options.id = options._id);
                        if (!options.id) {
                            ctx.body = {
                                ...response,
                                status: "error",
                                op: "remove-one",
                                error: "You must provide an id of the element to remove. Request payload must be a field id or _id."
                            };
                            resolve(ctx);
                        }
                        nedbs[opts.db][opts.collection].remove({ _id: options.id }, {}, (err, numRemoved) => {
                            if (err)
                                ctx.body = err;
                            else
                                ctx.body = {
                                    ...response,
                                    status: "success",
                                    op: "remove-one",
                                    nRemoved: numRemoved
                                };
                            resolve(ctx);
                        });
                    });
                    break;
                default:
                    ctx.body = 'No op configured for this storage route.';
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
            route.protected && await passport.authenticate("jwt", { session: false })(ctx, next);

            if (ctx.status === 401) {
                ctx.body = {
                    status: "unauthorized",
                    body: "You need to login in first."
                };
                resolve(ctx);
                return;
            }

            if (route.protected && !route.roles.includes(ctx.state.user.role)) {
                ctx.body = {
                    status: "unauthorized",
                    body: "Your user group is not authorized to view this content."
                };
                resolve(ctx);
                return;
            }

            switch (route.type) {
                case 'register':
                    const newUsername = ctx.request.body.username;
                    const newPsw = ctx.request.body.password;
                    switch (SYSTEM.auth.db.type) {
                        case 'mongodb':
                            const db = mongoClient.db(SYSTEM.auth.db.name);
                            const collection = db.collection(route.role);
                            collection.findOne({ username: newUsername }, (err, user) => {
                                if (user) {
                                    ctx.status = {
                                        status: "error",
                                        error: "Username is already taken."
                                    };
                                    resolve(ctx);
                                }
                                else {
                                    const newUser = {
                                        username: newUsername,
                                        password: newPsw
                                    };

                                    bcrypt.genSalt(10, (err, salt) => {
                                        bcrypt.hash(newUser.password, salt, (err, hash) => {
                                            if (err) throw err;
                                            newUser.password = hash;
                                            collection.insertOne(newUser, (err, user) => {
                                                if (err)
                                                    ctx.status = {
                                                        status: "error",
                                                        error: "Error while inserting user in db."
                                                    };
                                                resolve(ctx);
                                                ctx.body = user;
                                                resolve(ctx);
                                            })
                                        });
                                    });
                                }
                            });
                            break;
                        case 'nedb':
                        default:
                            nedbs[SYSTEM.auth.db.name][route.role].findOne({ username: newUsername }, (err, user) => {
                                    if (user) {
                                        ctx.status = {
                                            status: "error",
                                            error: "Username is already taken."
                                        };
                                        resolve(ctx);
                                    }
                                    else {
                                        const newUser = {
                                            username: newUsername,
                                            password: newPsw
                                        };

                                        bcrypt.genSalt(10, (err, salt) => {
                                            bcrypt.hash(newUser.password, salt, (err, hash) => {
                                                if (err) throw err;
                                                newUser.password = hash;
                                                nedbs[SYSTEM.auth.db.name][route.role].insert(newUser, (err, user) => {
                                                    if (err)
                                                        ctx.status = {
                                                            status: "error",
                                                            error: "Error while inserting user in db."
                                                        };
                                                    resolve(ctx);
                                                    ctx.body = user;
                                                    resolve(ctx);
                                                })
                                            });
                                        });
                                    }
                                });
                    }
                    break;
                case 'login':
                    const username = ctx.request.body.username;
                    const password = ctx.request.body.password;
                    switch (SYSTEM.auth.db.type) {
                        case 'mongodb':
                            const db = mongoClient.db(SYSTEM.auth.db.name);
                            const collection = db.collection(route.role);
                            collection.findOne({username})
                                .then((user) => {
                                    // Check for user
                                    if (!user) {
                                        ctx.body = {
                                            status: "error",
                                            error: "Username not found."
                                        };
                                        resolve(ctx);
                                        return;
                                    }

                                    // Check Password
                                    bcrypt
                                        .compare(password, user.password)
                                        .then(isMatch => {
                                            if (isMatch) {
                                                // User Matched

                                                // Create JWT Payload
                                                const payload = {
                                                    id: user.id,
                                                    username: user.username,
                                                    role: route.role
                                                };

                                                // Sign Token
                                                jwt.sign(
                                                    payload,
                                                    'secret',
                                                    { expiresIn: 3600 },
                                                    (err, token) => {
                                                        ctx.body = {
                                                            success: true,
                                                            token: 'Bearer ' + token
                                                        };
                                                        resolve(ctx);
                                                    }
                                                );
                                            }
                                            else {
                                                ctx.body = {
                                                    status: "error",
                                                    error: "Incorrect password."
                                                };
                                                resolve(ctx);
                                            }
                                        })
                                });
                            break;
                        case 'nedb':
                        default:
                            nedbs[SYSTEM.auth.db.name][route.role].findOne({username}, (err, user) => {
                                    // Check for user
                                    if (!user) {
                                        ctx.body = {
                                            status: "error",
                                            error: "Username not found."
                                        };
                                        resolve(ctx);
                                        return;
                                    }

                                    // Check Password
                                    bcrypt
                                        .compare(password, user.password)
                                        .then(isMatch => {
                                            if (isMatch) {
                                                // User Matched

                                                // Create JWT Payload
                                                const payload = {
                                                    id: user._id,
                                                    username: user.username,
                                                    role: route.role
                                                };

                                                // Sign Token
                                                jwt.sign(
                                                    payload,
                                                    'secret',
                                                    { expiresIn: 3600 },
                                                    (err, token) => {
                                                        ctx.body = {
                                                            success: true,
                                                            token: 'Bearer ' + token
                                                        };
                                                        resolve(ctx);
                                                    }
                                                );
                                            }
                                            else {
                                                ctx.body = {
                                                    status: "error",
                                                    error: "Incorrect password."
                                                };
                                                resolve(ctx);
                                            }
                                        })
                                });
                    }
                    break;
                case 'storage':
                    switch(route.dbms) {
                        case 'mongodb':
                            await mongodb(route.config)(ctx, next);
                            break;
                        case 'nedb':
                        default:
                            await nedb(route.config)(ctx, next);
                    }
                    resolve(ctx);
                    break;
                case 'static':
                    if (ctx.path === opts.mount && opts.mount !== '/') {
                        ctx.redirect(opts.mount + '/');
                        resolve(ctx);
                    }
                    if (!fs.existsSync(__dirname + '/www/' + route.dir + '/' + ctx.path.replace(opts.mount, ''))) {
                        await next();
                        resolve(ctx);
                        break;
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

    if (SYSTEM.dbms.active["nedb"]) {
        SYSTEM.dbms.nedb.databases.forEach(db => {
            nedbs[db.name] = {};
            db.collections.forEach(collection => {
                nedbs[db.name][collection] = new Datastore({ filename: __dirname + '/system/nedb/' + db.name + '_' + collection + '.db', autoload: true });
            });
        });
        nedbs[SYSTEM.auth.db.name] = {};
        SYSTEM.auth.roles.forEach(role => {
            nedbs[SYSTEM.auth.db.name][role.name] = new Datastore({ filename: __dirname + '/system/nedb/' + SYSTEM.auth.db.name + '_' + role.name + '.db', autoload: true });
        });
    }

    if (SYSTEM.dbms.active["mongodb"]) {
        MongoClient.connect(SYSTEM.dbms.mongodb.url, { useNewUrlParser: true },(err, client) => {
            if (err)
                console.log("Error in MongoDB connection.");
            else
                console.log("Connected successfully to MongoDB");
            mongoClient = client;
            // client.close();
        });
    }
}
