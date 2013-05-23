/*jslint node: true, indent: 2, white: true, vars: true */
/*globals suite, test, setup, suiteSetup, suiteTeardown, done, teardown */
'use strict';

var server = require('../lib/server');
var assert = require('assert');
var util = require('util');
var request = require('request');
var should = require('should');

var settings = require('../settings-test.js');
var User = require('../lib/models/User');

var BASEURL = 'http://localhost:' + settings.port + '/api';

suite('Compress', function () {
  var jar = request.jar();

  suiteSetup(function (done) {
    server.run(settings, done);
  });

  suiteTeardown(function () {
    server.stop();
  });

  setup(function (done) {
    var userA = {
      'name': 'User A',
      'email': 'a@localdata.com',
      'password': 'password'
    };

    // Remove the users.
    User.remove({}, function (error) {
      // Create a user.
      request.post({url: BASEURL + '/user', json: userA, jar: jar}, function (error, response, body) {
        done(error);
      });
    });
  });

  suite('GET', function () {
    var id;

    test('Requesting data', function (done) {
      request.get({
        url: BASEURL + '/surveys',
        headers: {
          'Accept-Encoding': 'gzip'
        },
        jar: jar
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

