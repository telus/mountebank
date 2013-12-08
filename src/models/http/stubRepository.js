'use strict';

var predicates = require('./predicates'),
    Q = require('q');

function create (proxy) {
    var stubs = [],
        injectState = {};

    function createResponse (stub) {
        var response = {
            statusCode: stub.statusCode || 200,
            headers: stub.headers || {},
            body: stub.body || ''
        };

        // We don't want to use keepalive connections, because a test case
        // may shutdown the stub, which prevents new connections for
        // the port, but that won't prevent the system under test
        // from reusing an existing TCP connection after the stub
        // has shutdown, causing difficult to track down bugs when
        // multiple tests are run.
        response.headers.connection = 'close';
        return response;
    }

    function trueForAll (obj, predicate) {
        // we avoid using 'every' to dry run every predicate during validation
        var results = Object.keys(obj).map(predicate);
        return results.every(function (result) { return result; });
    }

    function matchesPredicate (fieldName, predicate, request) {
        return trueForAll(predicate, function (key) {
            return predicates[key](fieldName, predicate[key], request);
        });
    }

    function findFirstMatch (request) {
        if (stubs.length === 0) {
            return undefined;
        }
        var matches = stubs.filter(function (stub) {
            var predicates = stub.predicates || {};
            return trueForAll(predicates, function (fieldName) {
                return matchesPredicate(fieldName, predicates[fieldName], request);
            });
        });
        return (matches.length === 0) ? undefined : matches[0];
    }

    function addStub (stub) {
        stubs.push(stub);
    }

    function resolve (request) {
        var stub = findFirstMatch(request) || { responses: [{ is: {} }]},
            stubResolver = stub.responses.shift(),
            deferred = Q.defer();

        stub.responses.push(stubResolver);

        getResolvedResponsePromise(stubResolver, request).done(function (response) {
            var match = {
                    timestamp: new Date().toJSON(),
                    request: request,
                    response: response
                };
            stub.matches = stub.matches || [];
            stub.matches.push(match);
            deferred.resolve(response);
        }, function (reason) {
            deferred.reject(reason);
        });

        return deferred.promise;
    }

    function getResolvedResponsePromise (stubResolver, request) {
        if (stubResolver.is) {
            return Q(createResponse(stubResolver.is));
        }
        else if (stubResolver.proxy) {
            return proxy.to(stubResolver.proxy, request);
        }
        else if (stubResolver.proxyOnce) {
            return proxy.to(stubResolver.proxyOnce, request).then(function (response) {
                stubResolver.is = response;
                return Q(response);
            });
        }
        else if (stubResolver.inject) {
            return inject(request, stubResolver.inject, injectState).then(function (response) {
                return Q(createResponse(response));
            });
        }
        else {
            return Q.reject({
                code: 'bad data',
                message: 'unrecognized stub resolver',
                source: JSON.stringify(stubResolver)
            });
        }
    }

    function inject (request, fn, state) {
        /* jshint evil: true, unused: false */
        var deferred = Q.defer(),
            scope = JSON.parse(JSON.stringify(request)),
            callback = function (response) { deferred.resolve(response);},
            injected = 'try {\n' +
                       '    var response = (' + fn + ')(scope, state, callback);\n' +
                       '    if (response) { callback(response); }\n' +
                       '}\n' +
                       'catch (error) {\n' +
                       '    deferred.reject(error);\n' +
                       '}';
        eval(injected);
        return deferred.promise;
    }

    return {
        addStub: addStub,
        resolve: resolve
    };
}

module.exports = {
    create: create
};