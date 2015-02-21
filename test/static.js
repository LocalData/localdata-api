/*jslint node: true */
/*globals suite, test, setup, suiteSetup, suiteTeardown, done, teardown */
'use strict';

var server = require('./lib/router');
var request = require('request');
var should = require('should');
var crypto = require('crypto');

var settings = require('../settings.js');

var BASEURL = 'https://localhost:' + settings.testSecurePort;
var BASE_HTTP = 'http://localhost:' + settings.port;

request = request.defaults({
  strictSSL: false
});


suite('Static', function () {
  suiteSetup(function (done) {
    server.run(done);
  });

  suiteTeardown(function (done) {
    server.stop(done);
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
        url: BASEURL + '/mobile',
        jar: false
      }, function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(200);
        response.should.be.html;
        response.headers.should.not.have.property('set-cookie');

        var hash = crypto.createHash('md5');
        hash.update(body);
        hash.digest('hex').should.equal(digest);

        done();
      });
    });

    test('base with slash', function (done) {
      request({
        url: BASEURL + '/mobile/',
        jar: false
      }, function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(200);
        response.should.be.html;
        response.headers.should.not.have.property('set-cookie');

        var hash = crypto.createHash('md5');
        hash.update(body);
        hash.digest('hex').should.equal(digest);

        done();
      });
    });

    test('index.html', function (done) {
      request({
        url: BASEURL + '/mobile/index.html',
        jar: false
      }, function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(200);
        response.should.be.html;
        response.headers.should.not.have.property('set-cookie');

        var hash = crypto.createHash('md5');
        hash.update(body);
        hash.digest('hex').should.equal(digest);

        done();
      });
    });
  });

  suite('Dashboard app', function () {
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
        url: BASEURL,
        jar: false
      }, function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(200);
        response.should.be.html;
        response.headers.should.not.have.property('set-cookie');

        var hash = crypto.createHash('md5');
        hash.update(body);
        hash.digest('hex').should.equal(digest);

        done();
      });
    });

    test('base with slash', function (done) {
      request({
        url: BASEURL + '/',
        jar: false
      }, function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(200);
        response.should.be.html;
        response.headers.should.not.have.property('set-cookie');

        var hash = crypto.createHash('md5');
        hash.update(body);
        hash.digest('hex').should.equal(digest);

        done();
      });
    });

    test('index.html', function (done) {
      request({
        url: BASEURL + '/index.html',
        jar: false
      }, function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(200);
        response.should.be.html;
        response.headers.should.not.have.property('set-cookie');

        var hash = crypto.createHash('md5');
        hash.update(body);
        hash.digest('hex').should.equal(digest);

        done();
      });
    });

    test('HTTP request for / redirects to HTTPS', function (done) {
      request({
        url: BASE_HTTP + '/',
        followRedirect: false
      }, function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(302);
        response.headers.location.slice(0,6).should.equal('https:');
        done();
      });
    });

    test('HTTP request for /index.html redirects to HTTPS', function (done) {
      request({
        url: BASE_HTTP + '/index.html',
        followRedirect: false
      }, function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(302);
        response.headers.location.slice(0,6).should.equal('https:');
        done();
      });
    });

  });
});
