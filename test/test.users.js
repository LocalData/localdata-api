/*jslint node: true, indent: 2, white: true, vars: true */
/*globals suite, test, setup, suiteSetup, suiteTeardown, done, teardown */
'use strict';

var server = require('../web.js');
var assert = require('assert');
var util = require('util');
var request = require('request');
var should = require('should');

var settings = require('../settings-test.js');

var users = require('../users.js');

var BASEURL = 'http://localhost:' + settings.port + '/api';

suite('Users -', function () {
  var Matt = {
    firstName: "Matt",
    lastName: "Hampel",
    email: "matth@codeforamerica.org"
  };

  suiteSetup(function (done) {
    server.run(settings, done);
  });

  suiteTeardown(function () {
    server.stop();
  });

  suite('creating and editing:', function () {
    test('create a user', function (done) {

      users.getOrCreate(Matt, function(MattInDatabase){
        MattInDatabase.should.have.property('_id');
        assert.equal(MattInDatabase.firstName, Matt.firstName); 
        assert.equal(MattInDatabase.lastName, Matt.lastName); 
        assert.equal(MattInDatabase.email, Matt.email); 
        done();
      });
    });

    test('users with the same email should not be created twice', function (done) {

      users.getOrCreate(Matt, function(MattInDatabase) {
        users.getOrCreate(Matt, function(MattInDatabaseTwo){
          assert.equal(String(MattInDatabase._id), String(MattInDatabaseTwo._id));
          done();
        });
      });
    });

    test('update a user name and email', function (done) {

      users.getOrCreate(Matt, function(MattInDatabase) {
        var firstId = MattInDatabase._id;

        MattInDatabase.firstName = "Prashant";
        MattInDatabase.email = "prashant@codeforamerica.org";

        users.getOrCreate(MattInDatabase, function(MattInDatabaseEdited){
          assert.equal(String(firstId), String(MattInDatabaseEdited._id)); 
          assert.equal(MattInDatabaseEdited.firstName, "Prashant"); 
          assert.equal(MattInDatabaseEdited.email, "prashant@codeforamerica.org"); 
          done();
        });
      });

    });

  });

  suite('DEL', function () {

    setup(function (done) {
      done();
    });

    test('Deleting a user', function (done) {
      // test for stuff
      assert.equal(true, false); 
      done();
    });

  });

  suite('GET', function () {

    suiteSetup(function (done) {
      done();
    });

    test('Get a user', function (done) {
      // test for stuff
      assert.equal(true, false); 

      done();
    });

    test('Log in', function (done) {
      // test for stuff
      assert.equal(true, false); 

      done();
    });

    test('Log out', function (done) {
      // test for stuff
      assert.equal(true, false); 

      done();
    });


    test('Get a user that does not exist', function (done) {
      // test for stuff
      assert.equal(true, false); 

      done();
    });


  });
});
