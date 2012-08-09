/*jslint node: true */
/*globals suite, test, setup, suiteSetup, suiteTeardown, done, teardown */
'use strict';

var server = require('../web.js');
var request = require('request');
var should = require('should');

var settings = require('../settings-test.js');

var BASEURL = 'http://localhost:' + settings.port;

suite('Static', function () {
  suiteSetup(function (done) {
    server.run(settings, done);
  });

  suiteTeardown(function () {
    server.stop();
  });

  suite('Mobile client', function () {
    test('base without slash', function (done) {
      request({
        url: BASEURL + '/mobile'
      }, function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(200);
        response.should.be.html;

        done();
      });
    });

    test('base with slash', function (done) {
      request({
        url: BASEURL + '/mobile/'
      }, function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(200);
        response.should.be.html;

        done();
      });
    });

    test('index.html', function (done) {
      request({
        url: BASEURL + '/mobile/index.html'
      }, function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(200);
        response.should.be.html;

        done();
      });
    });
  });

  suite('Browser app', function () {
    test('base without slash', function (done) {
      request({
        url: BASEURL
      }, function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(200);
        response.should.be.html;

        done();
      });
    });

    test('base with slash', function (done) {
      request({
        url: BASEURL + '/'
      }, function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(200);
        response.should.be.html;

        done();
      });
    });

    test('index.html', function (done) {
      request({
        url: BASEURL + '/index.html'
      }, function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(200);
        response.should.be.html;

        done();
      });
    });
  });

  suite('Operational interface', function () {
    test('base without slash', function (done) {
      request({
        url: BASEURL + '/ops'
      }, function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(200);
        response.should.be.html;

        done();
      });
    });

    test('base with slash', function (done) {
      request({
        url: BASEURL + '/ops/'
      }, function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(200);
        response.should.be.html;

        done();
      });
    });

    test('surveys.html', function (done) {
      request({
        url: BASEURL + '/ops/surveys.html'
      }, function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(200);
        response.should.be.html;

        done();
      });
    });
  });
});
