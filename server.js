// Sadkit v 0.0.1

//Dependencies
const http = require('http');
const url = require('url');
const StringDecoder = require("string_decoder").StringDecoder;

// Create Server
const server = http.createServer((req, res) => {

    let parsedUrl = url.parse(req.url, true);

    let path = parsedUrl.pathname;
    let trimmedPath = path.replace(/^\/+|\/+$/g,'');

    // Get the query string as an object
    let queryStringObject = parsedUrl.query;

    // Get the HTTP method
    let method = req.method.toLowerCase();

    // Get the headers as an object
    let headers = req.headers;

    // Get the payload, if any
    let decoder = new StringDecoder('utf-8');
    let buffer = '';
    req.on('data', (data) => {
        buffer += decoder.write(data);
    });
    req.on('end', () => {
        buffer += decoder.end();

        // Handling request routes
        let chosenHandler = typeof(router[trimmedPath]) !== 'undefined' ? router[trimmedPath] : handlers.notFound;

        // Construct the data object to send to the handler
        let data = {
            trimmedPath,
            queryStringObject,
            method,
            headers,
            payload: buffer
        };

        // Route the request to the handler specified in the router
        chosenHandler(data, (statusCode, payload) => {
            // Use the status code called back by the handler or default to 200
            statusCode = typeof(statusCode) == 'number' ? statusCode : 200;

            // Use the payload called back by the handler or default to an empty object
            payload = typeof(payload) == 'object' ? payload : {};

            // Convert the payload to a string
            let payloadString = JSON.stringify(payload);

            // Return the response
            res.setHeader('Content-Type', 'application/json');
            res.writeHead(statusCode);
            res.end(payloadString);

            // Log the request path
            console.log('Returning this response: ', statusCode, payloadString);
        });

        // console.log('Request received on path ' + trimmedPath + ' with method ' + method + ' and these query parameters', queryStringObject);
        // console.log('Request headers', headers);
        // console.log('Request payload', buffer);
    });

});

// Listen for incoming requests
server.listen(3000, () => {
    console.log('Server started on port 3000');
});

// Define the handlers
let handlers = {};

// Sample Handler
handlers.sample = (data, callback) => {
    // Callback a http status code, and a payload object
    callback(406, {'name': 'sample handler'});
};

// Not found handler
handlers.notFound = (data, callback) => {
    callback(404);
};

// Define a request router
let router = {
    'sample': handlers.sample
};