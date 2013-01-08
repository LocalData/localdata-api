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
  var Matt = function() {
    return {
      name: "Matt Hampel",
      email: "example@example.com",
      password: "abc123"
    };
  };

  suiteSetup(function (done) {
    server.run(settings, done);
  });

  suiteTeardown(function () {
    server.stop();
  });

  suite('finding, creating and editing:', function () {

    test('create a user', function (done) {
      users.User.create(new Matt(), function(error, user){
        user.should.have.property('_id');
        assert.equal(user.name, new Matt().name); 
        assert.equal(user.email, new Matt().email); 
        done();
      });
    });

    test('users must have an email', function (done) {     
      users.User.create({"name": "No Email", "password": "luggage"}, function(error, user){
        should.exist(error);
        error.code.should.equal(500);
        done();
      });
    });

    test('users must be created with a password', function (done) {     
      users.User.create({"name": "No Password", "email": "example@example.com"}, function(error, user){
        should.exist(error);
        error.code.should.equal(500);
        done();
      });
    });

    test('user emails must be unique', function (done) {
      users.User.create(new Matt(), function(error, userOne) {
        console.log("First user ", userOne);
        users.User.create(new Matt(), function(error, userTwo){
          console.log("Second user ", userTwo);
          should.exist(error);
          console.log(error);
          done();
        });
      });
    });

    test('update a user name and email', function (done) {
      users.User.create(new Matt(), function(error, user) {
        var tempId = user._id;
        console.log(tempId);
        user.name = "Prashant";
        user.email = "prashant@codeforamerica.org";

        users.User.update(user, function(error, userEdited){
          console.log(tempId);
          console.log("saved user" , user);
          console.log("saved user" , userEdited);

          assert.equal(String(tempId), String(user._id)); 
          assert.equal(user.name, "Prashant"); 
          assert.equal(user.email, "prashant@codeforamerica.org"); 
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

  suite('authentication:', function () {

    suiteSetup(function (done) {
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

  });
});
