'use strict';

var assert = require('assert'),
    api = require('../api'),
    promiseIt = require('../../testHelpers').promiseIt,
    port = api.port + 1;

describe('http imposter', function () {

    describe('GET /imposters/:id', function () {
        promiseIt('should return 404 if imposter has not been created', function () {
            return api.get('/imposters/3535').then(function (response) {
                assert.strictEqual(response.statusCode, 404);
            });
        });

        promiseIt('should provide access to all requests', function () {
            return api.post('/imposters', { protocol: 'http', port: port }).then(function () {
                return api.get('/first', port);
            }).then(function () {
                return api.get('/second', port);
            }).then(function () {
                return api.get('/imposters/' + port);
            }).then(function (response) {
                var requests = response.body.requests.map(function (request) {
                    return request.path;
                });
                assert.deepEqual(requests, ['/first', '/second']);
            }).finally(function () {
                return api.del('/imposters/' + port);
            });
        });


        promiseIt('should return list of stubs in order', function () {
            var first = { responses: [{ is: { body: '1' }}]},
                second = { responses: [{ is: { body: '2' }}]};

            return api.post('/imposters', { protocol: 'http', port: port, stubs: [first, second] }).then(function () {
                return api.get('/imposters/' + port);
            }).then(function (response) {
                assert.strictEqual(response.statusCode, 200);
                assert.deepEqual(response.body.stubs, [
                    { responses: [{ is: { body: '1' } }] },
                    { responses: [{ is: { body: '2' } }] }
                ]);
            }).finally(function () {
                return api.del('/imposters/' + port);
            });
        });

        promiseIt('should record matches against stubs', function () {
            var stub = { responses: [{ is: { body: '1' }}, { is: { body: '2' }}]};

            return api.post('/imposters', { protocol: 'http', port: port, stubs: [stub] }).then(function () {
                return api.get('/first', port);
            }).then(function () {
                return api.get('/second', port);
            }).then(function () {
                return api.get('/imposters/' + port);
            }).then(function (response) {
                var stubs = JSON.stringify(response.body.stubs),
                    withTimeRemoved = stubs.replace(/"timestamp":"[^"]+"/g, '"timestamp":"NOW"'),
                    actualWithoutTime = JSON.parse(withTimeRemoved),
                    requestHeaders = { accept: 'application/json', host: 'localhost:' + port, connection: 'keep-alive' };

                assert.deepEqual(actualWithoutTime, [{
                    responses: [{ is: { body: '1' } }, { is: { body: '2' } }],
                    matches: [
                        {
                            timestamp: 'NOW',
                            request: { path: '/first', method: 'GET', headers: requestHeaders, body: '' },
                            response: { statusCode: 200, headers: { connection: 'close' }, body: '1' }
                        },
                        {
                            timestamp: 'NOW',
                            request: { path: '/second', method: 'GET', headers: requestHeaders, body: '' },
                            response: { statusCode: 200, headers: { connection: 'close' }, body: '2' }
                        }
                    ]
                }]);
            }).finally(function () {
                return api.del('/imposters/' + port);
            });
        });
    });

    describe('DELETE /imposters/:id should shutdown server at that port', function () {
        promiseIt('should shutdown server at that port', function () {
            return api.post('/imposters', { protocol: 'http', port: port }).then(function (response) {
                return api.del(response.headers.location);
            }).then(function (response) {
                assert.strictEqual(response.statusCode, 200, 'Delete failed');

                return api.post('/imposters', { protocol: 'http', port: port });
            }).then(function (response) {
                assert.strictEqual(response.statusCode, 201, 'Delete did not free up port');
            }).finally(function () {
                return api.del('/imposters/' + port);
            });
        });

        promiseIt('should return a 200 even if the server does not exist', function () {
            return api.del('/imposters/9999').then(function (response) {
                assert.strictEqual(response.statusCode, 200);
            });
        });
    });
});