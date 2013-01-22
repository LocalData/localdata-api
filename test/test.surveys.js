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
var surveys = require('../surveys.js');

var passport = require('passport');


var BASEURL = 'http://localhost:' + settings.port + '/api';

suite('Surveys', function () {

  // Fake log in the user. 
  users.ensureAuthenticated = function(req, res, next) {
    req.user = { _id: "1" };
    return next();
  };

  var data_one = {
    "surveys" : [ {
      "name": "Just a survey",
      "users": ["A", "B"],
      "paperinfo": {
        "dpi": 150,
        "regmarks": [
          {"type": 0, "bbox": [20, 20, 70, 70]},
          {"type": 0, "bbox": [20, 1580, 70, 1630]},
          {"type": 0, "bbox": [1205, 1580, 1255, 1630]}
        ],
        "barcode": {"bbox": [1055, 20, 1255, 220]}
      }
    } ]
  };

  var data_two = {
    "surveys" : [ {
      "name": "Test survey 1",
      "paperinfo": {
        "dpi": 150,
        "regmarks": [
          {"type": 0, "bbox": [20, 20, 70, 70]},
          {"type": 0, "bbox": [20, 1580, 70, 1630]},
          {"type": 0, "bbox": [1205, 1580, 1255, 1630]}
        ],
        "barcode": {"bbox": [1055, 20, 1255, 220]}
      }
    }, {
      "name": "Test survey 2",
      "users": ["2"],
      "paperinfo": {
        "dpi": 150,
        "regmarks": [
          {"type": 0, "bbox": [20, 20, 70, 70]},
          {"type": 0, "bbox": [20, 1580, 70, 1630]},
          {"type": 0, "bbox": [1205, 1580, 1255, 1630]}
        ],
        "barcode": {"bbox": [1055, 20, 1255, 220]}
      }
    } ]
  };

  var sampleSurvey = {
    "name": "Sample survey",
    "slug": "sample-survey",
    "id": "1234",
    "users": ["2"],
    "paperinfo": {
      "dpi": 150,
      "regmarks": [
        {"type": 0, "bbox": [20, 20, 70, 70]},
        {"type": 0, "bbox": [20, 1580, 70, 1630]},
        {"type": 0, "bbox": [1205, 1580, 1255, 1630]}
      ],
      "barcode": {"bbox": [1055, 20, 1255, 220]}
    }
  };

  suiteSetup(function (done) {
    server.run(settings, done);
  });

  suiteTeardown(function () {
    server.stop();
  });

  suite("Utilities:", function() {
    test('Trim a survey of sensitive data', function (done) {
      var trimmedSurvey = surveys.trimSurvey(sampleSurvey);
      
      trimmedSurvey.should.have.property('name');
      trimmedSurvey.should.have.property('slug');
      trimmedSurvey.should.have.property('id');

      trimmedSurvey.should.not.have.property('users');

      done();
    });
  });

  suite('POST', function () {
    var url = BASEURL + '/surveys';

    var surveyId;

    test('Posting JSON to /surveys', function (done) {
      request.post({url: url, json: data_two}, function (error, response, body) {
        assert.ifError(error);
        assert.equal(response.statusCode, 201, 'Status should be 201. Status is ' + response.statusCode);

        var i;
        for (i = 0; i < data_two.surveys.length; i += 1) {
          // Save the survey id for later tests
          surveyId = body.surveys[i]._id;

          assert.equal(data_two.surveys[i].name, body.surveys[i].name, 'Response differs from posted data');
          assert.deepEqual(data_two.surveys[i].paperinfo, body.surveys[i].paperinfo, 'Response differs from posted data');

          assert.notEqual(body.surveys[i].id, null, 'Response does not have an ID.');

          body.surveys[i].should.have.property('users');
          assert.equal("1", body.surveys[i].users[0], 'Wrong or no user stored');

          // Security tests
          assert.equal(1, body.surveys[i].users.length, 'There should be only one user assigned, even though the POST had two');
          assert.notEqual("A", body.surveys[i].users[0], 'Wrong user stored');

          // Slug tests
          body.surveys[i].should.have.property('slug');
          body.surveys[i].slug.should.be.a('string');
        }

        done();
      });
    });


    test('Posting JSON to /surveys', function (done) {
      request.post({url: url, json: data_two}, function (error, response, body) {
        assert.ifError(error);
        assert.equal(response.statusCode, 201, 'Status should be 201. Status is ' + response.statusCode);

        var i;
        for (i = 0; i < data_two.surveys.length; i += 1) {
          assert.equal(data_two.surveys[i].name, body.surveys[i].name, 'Response differs from posted data');
          assert.deepEqual(data_two.surveys[i].paperinfo, body.surveys[i].paperinfo, 'Response differs from posted data');

          assert.notEqual(body.surveys[i].id, null, 'Response does not have an ID.');

          body.surveys[i].should.have.property('users');
          assert.equal("1", body.surveys[i].users[0], 'Wrong or no user stored');

          // Security tests
          assert.equal(1, body.surveys[i].users.length, 'There should be only one user assigned, even though the POST had two');
          assert.notEqual("A", body.surveys[i].users[0], 'Wrong user stored');

          // Slug tests
          body.surveys[i].should.have.property('slug');
          body.surveys[i].slug.should.be.a('string');
        }

        done();
      });
    });


  });

  suite('GET', function () {
    var id;
    var surveyTwo;

    setup(function (done) {
      request.post({url: BASEURL + '/surveys', json: data_two}, function(error, response, body) {
        if (error) { done(error); }
        id = body.surveys[0].id;
        surveyTwo = body.surveys[1];
        done();
      });
    });

    test('Getting all surveys for this user', function (done) {
      request.get({url: BASEURL + '/surveys'}, function (error, response, body) {
        assert.ifError(error);
        assert.equal(response.statusCode, 200, 'Status should be 200. Status is ' + response.statusCode);

        var parsed = JSON.parse(body);

        assert.notEqual(parsed.surveys, null, 'Parsed response body should contain a property called "surveys".');
        assert.ok(util.isArray(parsed.surveys), 'Response should contain an array');
        var i;
        for (i = 0; i < parsed.surveys.length; i += 1) {
          assert.notEqual(parsed.surveys[i].id, null, 'Returned surveys should have IDs.');
          parsed.surveys[i].should.have.property('slug');
          parsed.surveys[i].slug.should.be.a('string');
        }

        done();
      });
    });

    test('Getting a survey', function (done) {
      request.get({url: BASEURL + '/surveys/' + id}, function (error, response, body) {
        assert.ifError(error);
        assert.equal(response.statusCode, 200, 'Status should be 200. Status is ' + response.statusCode);

        var parsed = JSON.parse(body);

        assert.ok(parsed.survey, 'Parsed response body should have a property called "survey".');

        assert.equal(parsed.survey.id, id, 'The returned survey should match the requested ID.');
        assert.equal(data_one.surveys[0].name, parsed.survey.name, 'Response differs from posted data');
        assert.deepEqual(data_one.surveys[0].paperinfo, parsed.survey.paperinfo, 'Response differs from posted data');

        parsed.survey.should.have.property('slug');
        parsed.survey.slug.should.be.a('string');

        done();
      });
    });

    test('Getting a survey the user does not own', function (done) {
      request.get({url: BASEURL + '/surveys/' + surveyTwo.id}, function (error, response, body) {
        // TODO
        // We expect that the user will get basic survey information (survey name)
        // Response will still be 200 (??? -- is this the best?)
        assert.equal(response.statusCode, 403, 'Status should be 403 forbidden. Status is ' + response.statusCode);
        done();
      });
    });

  });

  suite('DEL', function () {
    var id;

    setup(function (done) {
      request.post({url: BASEURL + '/surveys', json: data_one}, function(error, response, body) {
        if (error) { done(error); }
        id = body.surveys[0].id;
        done();
      });
    });

    test('Deleting a survey', function (done) {
      request.del({url: BASEURL + '/surveys/' + id}, function (error, response, body) {
        assert.ifError(error);
        assert.equal(response.statusCode, 200, 'Status should be 200. Status is ' + response.statusCode);

        var parsed = JSON.parse(body);

        assert.equal(parsed.count, 1, 'We should have deleted 1 item.');

        done();
      });
    });

  });

});

