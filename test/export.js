/*jslint node: true */
/*globals suite, test, setup, suiteSetup, suiteTeardown, done, teardown */
'use strict';

var server = require('./lib/router');
var request = require('request');
var should = require('should');
var async = require('async');

var settings = require('../settings.js');
var fixtures = require('./data/fixtures');

var BASEURL = 'http://localhost:' + settings.port + '/api';

suite('Exports', function () {

  var dataTwenty = fixtures.makeResponses(20);
  var ownerJar;
  var strangerJar;
  var surveyId;

  suiteSetup(function (done) {
    async.series([
      server.run.bind(server),
      fixtures.clearSurveys,
      fixtures.clearUsers,
      // Create test users.
      function (next) {
        fixtures.setupUser(function (error, jar1, jar2) {
          ownerJar = jar1;
          strangerJar = jar2;
          next();
        });
      },
      // Create a test survey owned by one of the users.
      function (next) {
        request.post({
          url: BASEURL + '/surveys',
          json: fixtures.surveys,
          jar: ownerJar
        }, function (error, response, body) {
          if (error) { return next(error); }
          surveyId = body.surveys[0].id;
          next();
        });
      },
      // Clear existing responses.
      fixtures.clearResponses.bind(fixtures, surveyId),
      // Create some entries for the survey.
      request.post.bind(request, {
        url: BASEURL + '/surveys/' + surveyId + '/responses',
        json: dataTwenty
      })
    ], done);
  });

  suiteTeardown(function (done) {
    server.stop(done);
  });

  test('Shapefile', function (done) {
    request.get({
      url: BASEURL + '/surveys/' + surveyId + '/responses.zip',
      jar: ownerJar
    }, function (error, response, body) {
      should.not.exist(error);
      response.statusCode.should.equal(202);
      done();
    });
  });

  test('CSV', function (done) {
    request.get({
      url: BASEURL + '/surveys/' + surveyId + '/responses.csv',
      jar: ownerJar
    }, function (error, response, body) {
      should.not.exist(error);
      response.statusCode.should.equal(202);
      done();
    });
  });

  test('KML', function (done) {
    request.get({
      url: BASEURL + '/surveys/' + surveyId + '/responses.kml',
      jar: ownerJar
    }, function (error, response, body) {
      should.not.exist(error);
      response.statusCode.should.equal(202);
      done();
    });
  });

  test('Shapefile not found', function (done) {
    request.get({
      url: BASEURL + '/surveys/foo/responses.zip',
      jar: ownerJar
    }, function (error, response, body) {
      should.not.exist(error);
      response.statusCode.should.equal(404);
      done();
    });
  });

  test('CSV not found', function (done) {
    request.get({
      url: BASEURL + '/surveys/foo/responses.csv',
      jar: ownerJar
    }, function (error, response, body) {
      should.not.exist(error);
      response.statusCode.should.equal(404);
      done();
    });
  });

  test('KML not found', function (done) {
    request.get({
      url: BASEURL + '/surveys/foo/responses.kml',
      jar: ownerJar
    }, function (error, response, body) {
      should.not.exist(error);
      response.statusCode.should.equal(404);
      done();
    });
  });

  test('Shapefile not logged in', function (done) {
    request.get({
      url: BASEURL + '/surveys/' + surveyId + '/responses.zip',
      jar: request.jar()
    }, function (error, response, body) {
      should.not.exist(error);
      response.statusCode.should.equal(401);
      done();
    });
  });

  test('CSV not logged in', function (done) {
    request.get({
      url: BASEURL + '/surveys/' + surveyId + '/responses.csv',
      jar: request.jar()
    }, function (error, response, body) {
      should.not.exist(error);
      response.statusCode.should.equal(401);
      done();
    });
  });

  test('KML not logged in', function (done) {
    request.get({
      url: BASEURL + '/surveys/' + surveyId + '/responses.kml',
      jar: request.jar()
    }, function (error, response, body) {
      should.not.exist(error);
      response.statusCode.should.equal(401);
      done();
    });
  });

  test('Shapefile not logged in - public export on', function (done) {
    request.get({
      url: BASEURL + '/surveys/' + surveyId + '/responses.zip',
      jar: request.jar()
    }, function (error, response, body) {
      should.not.exist(error);
      response.statusCode.should.equal(200);
      done();
    });
  });

  test('CSV not logged in - public export on', function (done) {
    request.get({
      url: BASEURL + '/surveys/' + surveyId + '/responses.csv',
      jar: request.jar()
    }, function (error, response, body) {
      should.not.exist(error);
      response.statusCode.should.equal(200);
      done();
    });
  });

  test('KML not logged in - public export on', function (done) {
    request.get({
      url: BASEURL + '/surveys/' + surveyId + '/responses.kml',
      jar: request.jar()
    }, function (error, response, body) {
      should.not.exist(error);
      response.statusCode.should.equal(200);
      done();
    });
  });

  test('Shapefile wrong user', function (done) {
    request.get({
      url: BASEURL + '/surveys/' + surveyId + '/responses.zip',
      jar: strangerJar
    }, function (error, response, body) {
      should.not.exist(error);
      response.statusCode.should.equal(403);
      done();
    });
  });

  test('CSV wrong user', function (done) {
    request.get({
      url: BASEURL + '/surveys/' + surveyId + '/responses.csv',
      jar: strangerJar
    }, function (error, response, body) {
      should.not.exist(error);
      response.statusCode.should.equal(403);
      done();
    });
  });

  test('KML wrong user', function (done) {
    request.get({
      url: BASEURL + '/surveys/' + surveyId + '/responses.kml',
      jar: strangerJar
    }, function (error, response, body) {
      should.not.exist(error);
      response.statusCode.should.equal(403);
      done();
    });
  });
});
