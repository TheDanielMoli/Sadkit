# Sadkit [![npm][npm-image]][npm-url]

[npm-image]: https://img.shields.io/npm/v/sadkit.svg
[npm-url]: https://www.npmjs.com/package/sadkit

<p align="center">
  <img src="https://www.sadkit.com/assets/img/logo.png" alt="Sadkit Logo" width="200px" height="200px" />
</p>

<span align="center">Sadkit is a Node.js clustered web server with zero code needed. Just configuration files!</span>

## Getting Started

These instructions will get you a copy of the project up and running on your local machine for development and testing purposes. See deployment for notes on how to deploy the project on a live system.

### Prerequisites

Node.js is required to be installed on your system. In order to install Node.js, you can either [download it directly](https://nodejs.org/it/) or use [nvm (Node Version Manager)](https://github.com/creationix/nvm).

Sadkit has been developed using Node `v9.2.0`. Any higher version should be ok, I'd rather not go with a lower one.

As of January, 2019, [npm is installed with Node.js](https://www.npmjs.com/get-npm). No further action should be required.

Check your environment by running the followin commands either in Terminal or Command Propmpt:

```
node -v 
```

```
npm -v 
```

### Installing

Clone this repo. `cd Sadkit` and run `npm install`.

Run `node server` in order to start Sadkit. By default, Sadkit requires ports `80`, `443`, `8080`, `8443`. Ensure these ports are not in use by another program or change them in the configuration files.

## Configuring

Sadkit can be configured by modifying and extending the JSON configuration files under the `system/` directory, within the project. Further explanation about available properties will be available in the Documentation (*work in progress*).

## Deployment

It is highly recommended to generate proper SSL certificates. Take a look at [Let's Encrypt](https://letsencrypt.org/) for a free secure web.

## Built With

* [Node.js](https://nodejs.org/) - Runtime Environment
* [npm](https://www.npmjs.com/) - Dependency Management
* [Koa](https://koajs.com/) - Web Framework

## Contributing

Feel free to open an Issue or send me a direct message.

## Versioning

We use [SemVer](http://semver.org/) for versioning. For the versions available, see the [tags on this repository](https://github.com/Sadkit/Sadkit/tags). 

## Authors

* **Daniele Molinari** - [Sadkit](https://github.com/Sadkit)

## License

This project is licensed under the Apache License 2.0 - see the [LICENSE.md](LICENSE.md) file for details.

## Acknowledgments

* Major thanks to Ryan Dahl, creator of Node.js and to all of the npm contributors. Follow their repos in `package.json` in order to find them all.
