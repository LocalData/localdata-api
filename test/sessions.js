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
var SURVEY_URL = BASEURL + '/surveys';
var USER_URL = BASEURL + '/user';

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

suite('Sessions', function () {

  suiteSetup(function (done) {
    server.run(settings, done);
  });

  suiteTeardown(function () {
    server.stop();
  });

  test('Sessions should persist across server restart', function (done) {
    clearCollection('usersCollection', function(error, response){
      should.not.exist(error);

      request.post({url: USER_URL, json: generateUser()}, function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(200);
        response.should.be.json;

        // Stop the server
        server.stop();

        // Restart the server
        server.run(settings, function(){
          // Get the current user
          // Should still be logged in, even though the server has restarted.
          request.get({url: USER_URL}, function (error, response, body) {
            var userData = generateUser();
            body = JSON.parse(body);
            body.should.have.property("email", userData.email);
            body.should.have.property("name", userData.name);
            done();
          });
        });
      });

    });

  });

});
