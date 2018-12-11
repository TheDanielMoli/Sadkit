// Sadkit v 0.0.1

//Dependencies
const http = require('http');
const url = require('url');

// Create Server
const server = http.createServer((req, res) => {

    let parsedUrl = url.parse(req.url, true);

    let path = parsedUrl.pathname;
    let trimmedPath = path.replace(/^\/+|\/+$/g,'');

    let method = req.method.toLowerCase();

    res.end('Sadkit: Hello, World!');

    console.log('Request received on path ' + trimmedPath + ' with method ' + method);

});

// Listen for incoming requests
server.listen(3000, () => {
    console.log('Server started on port 3000');
});