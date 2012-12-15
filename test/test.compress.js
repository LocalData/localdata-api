/*jslint node: true, indent: 2, white: true, vars: true */
/*globals suite, test, setup, suiteSetup, suiteTeardown, done, teardown */
'use strict';

var server = require('../web.js');
var assert = require('assert');
var util = require('util');
var request = require('request');
var should = require('should');

var settings = require('../settings-test.js');

var BASEURL = 'http://localhost:' + settings.port + '/api';

suite('Compress', function () {
  suiteSetup(function (done) {
    server.run(settings, done);
  });

  suiteTeardown(function () {
    server.stop();
  });

  suite('GET', function () {
    var id;

    test('Requesting data', function (done) {
      request.get({
        url: BASEURL + '/surveys',
        headers: {
          'Accept-Encoding': 'gzip'
        }
      }, function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(200);
        response.headers.should.have.property('content-encoding');
        response.headers['content-encoding'].should.equal('gzip');
        done();
      });
    });
  });
});

