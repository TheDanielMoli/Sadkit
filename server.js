const fs = require('fs');

let SYSTEM = JSON.parse(fs.readFileSync('./system/main.json', 'utf8'));

const Koa = require('koa');
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

app.use(async (ctx, next) => {
    if (
        SYSTEM.hosts[ctx.request.hostname]
        &&
        SYSTEM.hosts[ctx.request.hostname].routes
        &&
        SYSTEM.hosts[ctx.request.hostname].routes[ctx.request.path]
        &&
        SYSTEM.hosts[ctx.request.hostname].routes[ctx.request.path][ctx.request.method]
    ) {
        let route = SYSTEM.hosts[ctx.request.hostname].routes[ctx.request.path][ctx.request.method];
        switch (route.type) {
            case 'json':
                ctx.set('Content-Type', 'application/json');
                ctx.body = route.response;
                break;
            case 'text':
            default:
                ctx.body = route.response;
        }
    }
    else {
        next();
    }
});

// default response

app.use(async ctx => {
    ctx.set('Content-Type', 'application/json');
    ctx.body = {
        ...SYSTEM.general.standard,
        host: ctx.request.host,
        hostname: ctx.request.hostname,
        port: ctx.request.headers.host.split(':')[1],
        path: ctx.request.path,
        ssl: ctx.secure,
        method: ctx.request.method,
        headers: ctx.request.headers
    };
});

if (SYSTEM.servers) {
    SYSTEM.servers.forEach(server => {
        app.listen(server.port, () => {
            console.log('Server listening on port ' + server.port);
        });
    });
}