/*jslint node: true */
/*globals suite, test, setup, suiteSetup, suiteTeardown, beforeEach, done, teardown */
'use strict';

var request = require('request');
var should = require('should');
var async = require('async');

var server = require('../lib/server');
var Org = require('../lib/models/Org');
var settings = require('../settings-test');

var fixtures = require('./data/fixtures');

var BASEURL = 'http://localhost:' + settings.port + '/api';
var BASE_LOGOUT_URL = 'http://localhost:' + settings.port + '/logout';
var USER_URL = BASEURL + '/user';
var LOGIN_URL = BASEURL + '/login';
var FORGOT_URL = BASEURL + '/user/forgot';
var RESET_URL = BASEURL + '/user/reset';

suite('Orgs', function () {
  var authorizedUser;
  var authorizedJar;
  var otherUser;
  var otherJar;
  var strangerUser;
  var strangerJar;

  suiteSetup(function (done) {
    // Curry the function for user with async.series
    function makeAdder(name) {
      return function (next) { fixtures.addUser(name, next); };
    }

    async.series([
      function startServer(next) {
        // Start the server.
        server.run(settings, next);
      },
      // We need the index to enforce uniqueness.
      function ensureIndexes(next) {
        Org.ensureIndexes(next);
      },
      function setupUsers(next) {
        // Create a couple of users.
        async.series([
          fixtures.clearUsers,
          makeAdder('User A'),
          makeAdder('User B'),
          makeAdder('User C')
        ], function (error, results) {
          if (error) { return done(error); }
          authorizedJar = results[1][0];
          authorizedUser = results[1][1];
          otherJar = results[2][0];
          otherUser = results[2][1];
          strangerJar = results[3][0];
          strangerUser = results[3][1];
          next();
        });
      }
    ], done);
  });

  suiteTeardown(function () {
    server.stop();
  });


  suite('POST', function () {
    // Create an org, logged in as a user.
    test('create an org when logged in', function (done) {
      var name = 'Funky Township';
      request.post({
        url: BASEURL + '/orgs',
        jar: authorizedJar,
        json: { orgs: [{ name: name }] }
      }, function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(201);

        body.should.have.property('orgs');
        body.orgs.should.have.length(1);

        body.orgs[0].should.have.property('id');
        body.orgs[0].should.not.have.property('_id');
        body.orgs[0].name.should.equal(name);
        body.orgs[0].users.should.include(authorizedUser);

        done();
      });
    });

    // Create an org, not logged in.
    // We should not be allowed.
    test('do not create an org anonymously', function (done) {
      var name = 'City of Funky';
      request.post({
        url: BASEURL + '/orgs',
        json: { orgs: [{ name: name }] }
      }, function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(401);
        done();
      });
    });

    // Create two orgs with the same name.
    // We should not be allowed.
    test('do not allow duplicate org names', function (done) {
      var name = 'Michiganderton';
      request.post({
        url: BASEURL + '/orgs',
        jar: authorizedJar,
        json: { orgs: [{ name: name }] }
      }, function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(201);

        // Second org, same name.
        request.post({
          url: BASEURL + '/orgs',
          jar: authorizedJar,
          json: { orgs: [{ name: name }] }
        }, function (error, response, body) {
          should.not.exist(error);
          response.statusCode.should.equal(400);
          done();
        });

      });
    });
  }); // end of POST suite

  suite('PUT', function () {
    var org;

    // For each test, clear the orgs and create a new one from authorizedUser.
    setup(function (done) {
      async.series([
        fixtures.clearOrgs,
        function (next) {
          fixtures.addOrg('Funk Township', authorizedJar, next);
        }
      ], function (error, results) {
        if (error) { return done(error); }
        org = results[1];
        done();
      });
    });

    // Add a user to an org.
    test('modify an org', function (done) {
      org.users.push(strangerUser);
      request.put({
        url: BASEURL + '/orgs/' + org.id,
        jar: authorizedJar,
        json: { org: org }
      }, function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(200);

        body.org.name.should.equal(org.name);
        body.org.id.should.equal(org.id);
        body.org.should.not.have.property('_id');
        body.org.users.should.include(authorizedUser);
        body.org.users.should.include(strangerUser);

        done();
      });
    });

    test('modify an org from an unauthorized user', function (done) {
      org.users.push(strangerUser);
      request.put({
        url: BASEURL + '/orgs/' + org.id,
        jar: strangerJar,
        json: { org: org }
      }, function (error, response, body) {
        should.not.exist(error);
        // We should not be allowed.
        response.statusCode.should.equal(403);
        done();
      });
    });
  });

  suite('GET', function () {
    var created;

    suiteSetup(function (done) {
      function addOrg(name, jar) {
        return function (next) { fixtures.addOrg(name, jar, next); };
      }

      // Clear the orgs, create 2 for authorizedUser and 1 for otherUser.
      async.series([
        fixtures.clearOrgs,
        addOrg('FancyCorp', authorizedJar),
        addOrg('Grass Roots Gang', authorizedJar),
        addOrg('WhatevsCorp', otherJar)
      ], function (error, results) {
        if (error) { return done(error); }
        created = results.slice(1);
        done();
      });
    });

    test('list all orgs anonymously', function (done) {
      // We should get back the three orgs we created.
      request.get({
        url: BASEURL + '/orgs'
      }, function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(200);

        var parsed = JSON.parse(body);
        parsed.should.have.property('orgs');
        parsed.orgs.length.should.equal(3);

        var i;
        for (i = 0; i < parsed.orgs.length; i += 1) {
          var returned = parsed.orgs[i];
          returned.name.should.equal(created[i].name);
          returned.should.have.property('id');
          returned.should.not.have.property('_id');
          returned.should.not.have.property('users');
        }

        done();
      });
    });

    test('list a user\'s orgs with credentials', function (done) {
      // We should get back the two orgs we created for this user.
      request.get({
        url: BASEURL + '/users/' + authorizedUser + '/orgs',
        jar: authorizedJar
      }, function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(200);

        var parsed = JSON.parse(body);
        parsed.should.have.property('orgs');
        parsed.orgs.length.should.equal(2);

        var i;
        for (i = 0; i < parsed.orgs.length; i += 1) {
          var returned = parsed.orgs[i];
          returned.name.should.equal(created[i].name);
          returned.should.have.property('id');
          returned.should.not.have.property('_id');
          returned.should.have.property('users');
          returned.users.should.include(authorizedUser);
        }

        done();
      });
    });

    test('list a user\'s lack of orgs with credentials', function (done) {
      // We should not get any orgs back.
      request.get({
        url: BASEURL + '/users/' + strangerUser + '/orgs',
        jar: strangerJar
      }, function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(200);

        var parsed = JSON.parse(body);
        parsed.should.have.property('orgs');
        parsed.orgs.length.should.equal(0);

        done();
      });
    });

    test('list an unrelated user\'s orgs', function (done) {
      // Logged in as strangerUser, requesting orgs of authorizedUser.
      // We should be denied permission.
      request.get({
        url: BASEURL + '/users/' + authorizedUser + '/orgs',
        jar: strangerJar
      }, function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(403);
        done();
      });
    });

    test('list a user\'s orgs anonymously', function (done) {
      // Not logged in, requesting orgs of authorizedUser.
      // We should receive 401 Unauthorized.
      request.get({
        url: BASEURL + '/users/' + authorizedUser + '/orgs'
      }, function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(401);
        done();
      });
    });

    test('list the current user\'s orgs', function (done) {
      // We should get the user's two orgs.
      request.get({
        url: BASEURL + '/user/orgs',
        jar: authorizedJar
      }, function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(200);

        var parsed = JSON.parse(body);
        parsed.should.have.property('orgs');
        parsed.orgs.length.should.equal(2);

        var i;
        for (i = 0; i < parsed.orgs.length; i += 1) {
          var returned = parsed.orgs[i];
          returned.name.should.equal(created[i].name);
          returned.should.have.property('id');
          returned.should.not.have.property('_id');
          returned.should.have.property('users');
          returned.users.should.include(authorizedUser);
        }

        done();
      });
    });

    test('list the current user\'s orgs anonymously', function (done) {
      // Not logged in, requesting orgs of current user.
      // We should receive 401 Unauthorized.
      request.get({
        url: BASEURL + '/user/orgs'
      }, function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(401);
        done();
      });
    });

  }); // end of GET suite


});
