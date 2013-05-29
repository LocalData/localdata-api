/*jslint node: true, indent: 2, white: true, vars: true */
/*globals suite, test, setup, suiteSetup, suiteTeardown, beforeEach, done, teardown */
'use strict';

// Libraries
var assert = require('assert');
var mongo = require('mongodb');
var request = require('request');
var should = require('should');
var util = require('util');
var async = require('async');

// LocalData
var settings = require('../settings-test.js');
var User = require('../lib/models/User');
var users = require('../lib/controllers/users');

var server = require('./lib/router');
var fixtures = require('./data/fixtures');

var BASEURL = 'http://localhost:' + settings.port + '/api';
var SURVEY_URL = BASEURL + '/surveys';
var USER_URL = BASEURL + '/user';

suite('Sessions', function () {

  suiteSetup(function (done) {
    server.run(settings, done);
  });

  suiteTeardown(function () {
    server.stop();
  });

  test('Sessions should persist across server restart', function (done) {
    var jar;
    var user;
    async.series([
      fixtures.clearUsers,
      function (next) {
        fixtures.addUser('Session User', function (error, newJar, id, newUser) {
          if (error) { return next(error); }
          jar = newJar;
          user = newUser;
          next();
        });
      },
      function (next) {
        server.stop(next);
      },
      function (next) {
        server.run(settings, next);
      },
      function (next) {
        // Get the current user
        // Should still be logged in, even though the server has restarted.
        request.get({
          url: USER_URL,
          jar: jar
        }, function (error, response, body) {
          body = JSON.parse(body);
          body.should.have.property('email', user.email);
          body.should.have.property('name', user.name);
          done();
        });
      }
    ], function (error) {
      done(error);
    });
  });

});
