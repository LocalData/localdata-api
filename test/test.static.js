/*jslint node: true */
/*globals suite, test, setup, suiteSetup, suiteTeardown, done, teardown */
'use strict';

var server = require('../web.js');
var request = require('request');
var should = require('should');
var crypto = require('crypto');

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
    var digest;

    suiteSetup(function (done) {
      request({
        url: settings.mobilePrefix + '/index.html'
      }, function (error, response, body) {
        if (error) { return done(error); }

        var hash = crypto.createHash('md5');
        hash.update(body);
        digest = hash.digest('hex');

        done();
      });
    });

    test('base without slash', function (done) {
      request({
        url: BASEURL + '/mobile'
      }, function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(200);
        response.should.be.html;

        var hash = crypto.createHash('md5');
        hash.update(body);
        hash.digest('hex').should.equal(digest);

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

        var hash = crypto.createHash('md5');
        hash.update(body);
        hash.digest('hex').should.equal(digest);

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

        var hash = crypto.createHash('md5');
        hash.update(body);
        hash.digest('hex').should.equal(digest);

        done();
      });
    });
  });

  suite('Admin app', function () {
    var digest;

    suiteSetup(function (done) {
      request({
        url: settings.adminPrefix + '/index.html'
      }, function (error, response, body) {
        if (error) { return done(error); }

        var hash = crypto.createHash('md5');
        hash.update(body);
        digest = hash.digest('hex');

        done();
      });
    });

    test('base without slash', function (done) {
      request({
        url: BASEURL
      }, function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(200);
        response.should.be.html;

        var hash = crypto.createHash('md5');
        hash.update(body);
        hash.digest('hex').should.equal(digest);

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

        var hash = crypto.createHash('md5');
        hash.update(body);
        hash.digest('hex').should.equal(digest);

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

        var hash = crypto.createHash('md5');
        hash.update(body);
        hash.digest('hex').should.equal(digest);

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

    test('404', function (done) {
      request({
        url: BASEURL + '/ops/doesnotexist.html'
      }, function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(404);

        done();
      });
    });
  });
});
