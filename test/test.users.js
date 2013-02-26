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
var server = require('../web.js');
var settings = require('../settings-test.js');
var users = require('../users.js');

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
      email: "matth@localdata.com",
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
    server.run(settings, done);
  });

  suiteTeardown(function () {
    server.stop();
  });

  suite('finding, creating and editing without the API:', function () {
    
    test('create a user', function (done) {
      clearCollection('usersCollection', function(error, response){
        should.not.exist(error);

        users.User.create(generateUser(), function(error, user){
          user.should.have.property('_id');
          user.should.not.have.property('randomThing');
          assert.equal(user.name, generateUser().name);
          assert.equal(user.email, generateUser().email);
          done();
        });
      });
    });


    test('users must have an email', function (done) { 
      clearCollection('usersCollection', function(error, response){
        should.not.exist(error);

        users.User.create({"name": "No Email", "password": "luggage"}, function(error, user){
          should.exist(error);
          error.code.should.equal(400);
          done();
        });
      });
    });

    test('users must be created with a password', function (done) {
      clearCollection('usersCollection', function(error, response){
        should.not.exist(error);
        users.User.create({"name": "No Password", "email": "matth@localdata.com"}, function(error, user){
          should.exist(error);
          error.code.should.equal(400);
          done();
        });
      });
    });

    test('user emails must be unique', function (done) {
      clearCollection('usersCollection', function(error, response){
        should.not.exist(error);
        users.User.create(generateUser(), function(error, userOne) {
          // console.log("First user ", userOne);
          users.User.create(generateUser(), function(error, userTwo){
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
        users.User.create(generateUser(), function(error, user) {
          var tempId = user._id;
          user.name = "Prashant";
          user.email = "prashant@codeforamerica.org";

          users.User.update(user, function(error){
            // console.log(tempId);
            console.log("first user" , user);

            should.not.exist(error);

            users.User.findOne({"email": "prashant@codeforamerica.org"}, function(error, user){
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

          body.should.have.property("email", "matth@localdata.com");
          body.should.have.property("name", "Matt Hampel");
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

            parsed.should.have.property("email", "matth@localdata.com");
            parsed.should.have.property("name", "Matt Hampel");
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
      setupTest(function(error, response) {
        var user = generateUser();
        // Set a reset token
        request.post({url: FORGOT_URL, json: {user: {email: user.email}}}, function(error, response, body) {
          should.not.exist(error);
          response.statusCode.should.equal(200);

          // Get the reset token
          // (uses an internal API; by default, this is emailed to the user)
          user = users.User.findOne({ email: user.email }, function(error, user) {

            // Change the password using the token
            var newPassword = 'placebased';
            var resetObj = {
              'reset': {
                token: user.reset.token,
                password: newPassword
              }
            };

            // Override the token hash function to just pass the value through
            users.User.hashToken = function(token) {
              return token;
            };

            // Reset the password
            request.post({url: RESET_URL, json: resetObj}, function(error, response, body) {
              // We should be redirected to login.
              should.not.exist(error);
              response.statusCode.should.equal(302);

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
