/*jslint node: true, indent: 2, white: true, vars: true */
/*globals suite, test, setup, suiteSetup, suiteTeardown, done, teardown */
'use strict';

var server = require('../web.js');
var assert = require('assert');
var util = require('util');
var request = require('request');
var should = require('should');

var settings = require('../settings-test.js');

var BASEURL = 'http://localhost:' + settings.port + '/api';

suite('Users', function () {
  var myuser = {};

  suiteSetup(function (done) {
    server.run(settings, done);
  });

  suiteTeardown(function () {
    server.stop();
  });

  suite('User', function () {
    test('Create a user', function (done) {
      // test for stuff
      assert.equal(true, false); 

      done();
    });

    test('Update a user', function (done) {
      // test for stuff
      assert.equal(true, false); 

      done();
    });

    test('Create a user that already exists', function (done) {
      // test for stuff
      assert.equal(true, false); 

      done();
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
