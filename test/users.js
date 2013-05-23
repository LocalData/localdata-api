/*jslint node: true, indent: 2, white: true, vars: true */
/*globals suite, test, setup, suiteSetup, suiteTeardown, beforeEach, done, teardown */
'use strict';

// Libraries
var assert = require('assert');
var mongo = require('mongodb');
var request = require('request');
var should = require('should');
var util = require('util');

// LocalData
var server = require('../lib/server');
var settings = require('../settings-test.js');
var User = require('../lib/models/User');
var users = require('../lib/controllers/users');

var BASEURL = 'http://localhost:' + settings.port + '/api';
var BASE_LOGOUT_URL = 'http://localhost:' + settings.port + '/logout';
var USER_URL = BASEURL + '/user';
var LOGIN_URL = BASEURL + '/login';
var FORGOT_URL = BASEURL + '/user/forgot';
var RESET_URL = BASEURL + '/user/reset';

suite('Users -', function () {
  var generateUser = function() {
    return {
      name: "Matt Hampel",
      email: settings.email.to,
      randomThing: "security problem!",
      password: "abc123"
    };
  };

  /**
   * Remove all results from a collection
   * @param  {String}   collection Name of the collection
   * @param  {Function} done       Callback, accepts error, response
   */
  var clearCollection = function(collectionName, done) {
    var db = new mongo.Db(settings.mongo_db, new mongo.Server(settings.mongo_host,
                                                          settings.mongo_port,
                                                          {}), { w: 1, safe: true });

    db.open(function() {
      db.collection(collectionName, function(error, collection) {
        if(error) {
          console.log("BIG ERROR");
          console.log(error);
          assert(false);
          done(error);
        }

        // Remove all the things!
        collection.remove({}, function(error, response){
          should.not.exist(error);
          done(error, response);
        });
      });

    });
  };


  /**
   * Log out the user, clear the user collection, and create a test user
   * @param  {Function} done           Params (error, response)
   */
  var setupTest = function(done) {
    // Log out
    request.get({url: BASE_LOGOUT_URL}, function(error, response, body) {
      should.not.exist(error);
      // Clear out the users
      clearCollection('usersCollection', function(error, response){
        should.not.exist(error);
        // Create a new user
        request.post({url: USER_URL, json: generateUser()}, function (error, response, body) {
          should.not.exist(error);
          done(error, response);
        });
      });
    });
  };

  suiteSetup(function (done) {
    server.run(settings, function (error) {
      if (error) { return done(error); }
      // We need the email index to be in place, so we can enforce uniqueness
      // constraints, but we don't automatically create indexes to avoid
      // ill-timed index creation on production systems.
      User.ensureIndexes(done);
    });
  });

  suiteTeardown(function () {
    server.stop();
  });

  suite('finding, creating and editing without the API:', function () {

    test('create a user', function (done) {
      clearCollection('usersCollection', function(error, response){
        should.not.exist(error);

        var userData = generateUser();
        User.create(userData, function (error, user) {
          user.should.have.property('_id');
          user.should.not.have.property('randomThing');
          assert.equal(user.name, userData.name);
          assert.equal(user.email, userData.email);
          done();
        });
      });
    });


    test('users must have an email', function (done) {
      clearCollection('usersCollection', function(error, response){
        should.not.exist(error);

        (new User({"name": "No Email", "password": "luggage"})).save(function (error, user) {
          should.exist(error);
          error.name.should.equal('ValidationError');
          done();
        });
      });
    });

    test('users must be created with a password', function (done) {
      clearCollection('usersCollection', function(error, response){
        should.not.exist(error);
        User.create({"name": "No Password", "email": "matth@localdata.com"}, function(error, user){
          should.exist(error);
          error.name.should.equal('ValidationError');
          done();
        });
      });
    });

    test('user emails must be unique', function (done) {
      clearCollection('usersCollection', function(error, response){
        should.not.exist(error);
        User.create(generateUser(), function(error, userOne) {
          // console.log("First user ", userOne);
          User.create(generateUser(), function(error, userTwo){
            // console.log("Second user ", userTwo);
            should.exist(error);
            done();
          });
        });
      });
    });

    test('update a user name and email', function (done) {
      clearCollection('usersCollection', function(error, response){
        should.not.exist(error);
        User.create(generateUser(), function(error, user) {
          var tempId = user._id;
          user.name = "Prashant";
          user.email = "prashant@codeforamerica.org";

          user.save(function (error) {
            // console.log(tempId);
            console.log("first user" , user);

            should.not.exist(error);

            User.findOne({"email": "prashant@codeforamerica.org"}, function (error, user) {
              // Make sure the old and the new have the same Id
              console.log("Found this user", user);
              assert.equal(String(tempId), String(user._id));
              assert.equal(user.name, "Prashant");
              done();
            });
          });
        });
      });
    });

  });

  // suite('DEL', function () {

  //   setup(function (done) {
  //     done();
  //   });

  //   test('Deleting a user', function (done) {
  //     // test for stuff
  //     assert.equal(true, false);
  //     done();
  //   });

  // });

  suite('authentication API:', function () {
    suiteSetup(function (done) {
      done();
    });

    test('Create a user via API', function (done) {
      clearCollection('usersCollection', function(error, response){
        should.not.exist(error);
        request.post({url: USER_URL, json: generateUser()}, function (error, response, body) {
          should.not.exist(error);
          response.statusCode.should.equal(200);

          response.should.be.json;

          var userData = generateUser();
          body.should.have.property("email", userData.email);
          body.should.have.property("name", userData.name);
          body.should.not.have.property("randomThing");
          body.should.not.have.property("password");
          body.should.not.have.property("hash");

          done();
        });
      });
    });

    test('Log in a user via the API', function (done) {

      // First, let's log out
      // Just so we don't unfairly pass this test :-)
      request.get({url: BASE_LOGOUT_URL}, function(error, response, body) {

        // Then, let's log in.
        request.post({url: LOGIN_URL, json: generateUser()}, function (error, response, body) {
          should.not.exist(error);
          response.statusCode.should.equal(302);

          request.get({url: USER_URL}, function (error, response, body){
            should.not.exist(error);
            response.statusCode.should.equal(200);
            response.should.be.json;

            var parsed = JSON.parse(body);

            var userData = generateUser();
            parsed.should.have.property("email", userData.email);
            parsed.should.have.property("name", userData.name);
            parsed.should.not.have.property("randomThing");
            parsed.should.not.have.property("password");
            parsed.should.not.have.property("hash");

            done();
          });
        });

      });
    });

    test('Log in a user with the wrong password', function (done) {
      setupTest(function(error, response) {
        var badUser = generateUser();
        badUser.password = 'badpassword';
        request.post({url: LOGIN_URL, json: badUser}, function (error, response, body) {
          should.not.exist(error);
          response.statusCode.should.equal(400);
          response.body.should.equal('Password incorrect');

          done();
        });
      });
    });

    test('Reset a user password', function (done) {
      // There are a lot of things happening in the test and on the server, so
      // we need some more time for this test.
      this.timeout(3000);

      setupTest(function(error, response) {
        var user = generateUser();
        // Set a reset token
        request.post({url: FORGOT_URL, json: {user: {email: user.email}}}, function(error, response, body) {
          should.not.exist(error);
          response.statusCode.should.equal(200);

          // FIXME: this is a hack
          // Set the hashed reset token, so we know what it is.
          var token = 'THISISAFAKETOKEN';
          User.findOneAndUpdate({ email: user.email }, { $set: { 'reset.hashedToken': User.hashToken(token) } }, function (error, doc) {
            var resetString = users.serializeResetInfo(doc.email, token);

            // Change the password using the token
            var newPassword = 'placebased';
            var resetInfo = users.deserializeResetInfo(resetString);
            var resetObj = {
              'reset': {
                email: resetInfo.email,
                token: resetInfo.token,
                password: newPassword
              }
            };

            // Reset the password
            request.post({url: RESET_URL, json: resetObj}, function(error, response, body) {
              // We should be redirected to login.
              should.not.exist(error);
              response.statusCode.should.equal(302);

              // Logout, since the reset action logs us in
              request.get({url: BASE_LOGOUT_URL}, function (error, response, body) {
                should.not.exist(error);
                response.statusCode.should.equal(200);

                // Check to see that we changed the password successfully
                user.password = newPassword;
                request.post({url: LOGIN_URL, json: user}, function(error, response, body) {
                  should.not.exist(error);
                  response.statusCode.should.equal(302);

                  // Make sure that the token doesn't work twice
                  request.post({url: RESET_URL, json: resetObj}, function(error, response, body) {
                    should.not.exist(error);
                    response.statusCode.should.equal(400);
                    done();
                  });
                });

              });

            });
          });
        });
      });
    });


    test('Try to get details about the current user via API when not logged in', function (done) {
      clearCollection('usersCollection', function(error, response){
        // First, let's log out
        request.get({url: BASE_LOGOUT_URL}, function(error, response, body) {
          request.get({url: USER_URL}, function(error, response, body) {
            response.statusCode.should.equal(401);
            done();
          });
        });
      });
    });


  });
});
