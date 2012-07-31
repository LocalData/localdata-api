/*jslint node: true, indent: 2, white: true, vars: true */
/*globals suite, test, setup, suiteSetup, suiteTeardown, done, teardown */
'use strict';

var server = require('../web.js');
var assert = require('assert');
var util = require('util');
var request = require('request');

var settings = require('../settings-test.js');

var BASEURL = 'http://localhost:' + settings.port;

suite('Surveys', function () {
  var data_one = {
    "surveys" : [ {
      "name": "Just a survey",
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

  suiteSetup(function (done) {
    server.run(settings, done);
  });

  suiteTeardown(function () {
    server.stop();
  });

  suite('POST', function () {
    var url = BASEURL + '/surveys';
    test('Posting JSON to /surveys', function (done) {
      request.post({url: url, json: data_two}, function (error, response, body) {
        assert.ifError(error);
        assert.equal(response.statusCode, 201, 'Status should be 201. Status is ' + response.statusCode);

        var i;
        for (i = 0; i < data_two.surveys.length; i += 1) {
          assert.equal(data_two.surveys[i].name, body.surveys[i].name, 'Response differs from posted data');
          assert.deepEqual(data_two.surveys[i].paperinfo, body.surveys[i].paperinfo, 'Response differs from posted data');

          assert.notEqual(body.surveys[i].id, null, 'Response does not have an ID.');
        }

        done();
      });
    });
  });

  suite('GET', function () {
    var id;

    setup(function (done) {
      request.post({url: BASEURL + '/surveys', json: data_one}, function(error, response, body) {
        if (error) { done(error); }
        id = body.surveys[0].id;
        done();
      });
    });

    test('Getting all surveys', function (done) {
      request.get({url: BASEURL + '/surveys'}, function (error, response, body) {
        assert.ifError(error);
        assert.equal(response.statusCode, 200, 'Status should be 200. Status is ' + response.statusCode);

        var parsed = JSON.parse(body);

        assert.notEqual(parsed.surveys, null, 'Parsed response body should contain a property called "surveys".');
        assert.ok(util.isArray(parsed.surveys), 'Response should contain an array');
        var i;
        for (i = 0; i < parsed.surveys.length; i += 1) {
          assert.notEqual(parsed.surveys[i].id, null, 'Returned surveys should have IDs.');
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

