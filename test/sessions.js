/*jslint node: true, indent: 2, white: true, vars: true */
/*globals suite, test, setup, suiteSetup, suiteTeardown, beforeEach, done, teardown */
'use strict';

// Libraries
var mongoose = require('mongoose');
var request = require('request');
var should = require('should');
var async = require('async');

// LocalData
var settings = require('../settings.js');

var server = require('./lib/router');
var fixtures = require('./data/fixtures');

var BASEURL = 'http://localhost:' + settings.port;
var USER_URL = BASEURL + '/api/user';
var PING_URL = BASEURL + '/ping';

suite('Sessions', function () {

  suiteSetup(function (done) {
    server.run(done);
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
        server.run(next);
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

  function getSessionCount(done) {
    mongoose.connection.collection('sessions').find({}).count(done);
  }

  test('Ping endpoint should bypass session management', function (done) {
    var initialCount;
    async.series([
      function (next) {
        getSessionCount(function (error, count) {
          initialCount = count;
          next(error);
        });
      },
      function (next) {
        request.get({
          url: PING_URL,
          jar: null
        }, function (error, response, body) {
          should.not.exist(error);
          response.statusCode.should.equal(200);
          response.headers.should.not.have.property('set-cookie');
          next();
        });
      },
      function (next) {
        getSessionCount(function (error, count) {
          should.not.exist(error);
          initialCount.should.equal(count);
          next();
        });
      }
    ], function (error) {
      should.not.exist(error);
      done();
    });
  });

});
