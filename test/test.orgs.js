/*jslint node: true */
/*globals suite, test, setup, suiteSetup, suiteTeardown, beforeEach, done, teardown */
'use strict';

var request = require('request');
var should = require('should');
var async = require('async');

var server = require('../lib/server');
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
  var strangerUser;
  var strangerJar;

  suiteSetup(function (done) {
    async.series([
      function (next) {
        // Start the server.
        server.run(settings, next);
      },
      function (next) {
        // Create a couple of users.
        fixtures.setupUser(function (error, jar1, jar2, user1, user2) {
          if (error) { return done(error); }
          authorizedUser = user1;
          authorizedJar = jar1;
          strangerUser = user2;
          strangerJar = jar2;

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
  }); // end of POST suite

  suite('PUT', function () {
    var org;

    // For each test, clear the orgs and create a new one from authorizedUser.
    setup(function (done) {
      async.series([
        fixtures.clearOrgs,
        function (next) {
          fixtures.createOrg('Funk Township', authorizedJar, next);
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
      // Clear the orgs and create two fresh ones.
      fixtures.clearOrgs(function (error) {
        if (error) { return done(error); }
        async.map(['FancyCorp', 'Grass Roots Gang'], function (name, next) {
          fixtures.createOrg(name, authorizedJar, next);
        }, function (error, results) {
          if (error) { return done(error); }
          created = results;
          done();
        });
      });
    });

    test('list all orgs anonymously', function (done) {
      // We should get back the two orgs we created.
      request.get({
        url: BASEURL + '/orgs'
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

  }); // end of GET suite


});
