'use strict';

var express = require('express'),
    path = require('path'),
    middleware = require('./util/middleware'),
    homeController = require('./controllers/homeController'),
    ImpostersController = require('./controllers/impostersController'),
    ImposterController = require('./controllers/imposterController'),
    Imposter = require('./models/imposter'),
    logger = require('winston'),
    fs = require('fs');

function create (options) {
    var app = express(),
        imposters = {},
        protocols = {
            'http': require('./models/http/server').initialize(options.allowInjection)
        },
        impostersController = ImpostersController.create(protocols, imposters, Imposter),
        imposterController = ImposterController.create(imposters),
        validateImposterExists = middleware.createImposterValidator(imposters);

    logger.remove(logger.transports.Console);
    logger.add(logger.transports.Console, { colorize: true });
    logger.add(logger.transports.File, { filename: options.logfile, timestamp: true });

    app.use(middleware.useAbsoluteUrls(options.port));
    app.use(middleware.logger('[mb  /' + options.port + '] :method :url'));
    app.use(express.json());
    app.use(express.static(path.join(__dirname, 'public')));
    app.use(express.errorHandler());

    app.disable('x-powered-by');
    app.set('views', path.join(__dirname, 'views'));
    app.set('view engine', 'ejs');

    app.listen(options.port);
    console.log('mountebank now taking orders - point your browser to http://localhost:' + options.port + ' for help');

    app.get('/', homeController.get);
    app.get('/imposters', impostersController.get);
    app.post('/imposters', impostersController.post);
    app.get('/imposters/:id', validateImposterExists, imposterController.get);
    app.del('/imposters/:id', imposterController.del);

    app.get('/logs', function (request, response) {
        response.render('logs', { content: fs.readFileSync(options.logfile) });
    });

    // Brochure-ware sections
    ['faqs', 'docs', 'license', 'contributing', 'support', 'docs/protocols/http'].forEach(function (endpoint) {
        app.get('/' + endpoint, function (request, response) { response.render(endpoint); });
    });

    return {
        close: function () {
            console.log('Adios - see you soon?');
        }
    };
}

module.exports = {
    create: create
};