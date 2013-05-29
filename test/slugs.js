/*jslint node: true */
/*globals suite, test, setup, suiteSetup, suiteTeardown, done, teardown */
'use strict';

var server = require('./lib/router');
var util = require('util');

var mongo = require('mongodb');
var request = require('request');
var should = require('should');
var util = require('util');
var async = require('async');

var settings = require('../settings-test.js');
var fixtures = require('./data/fixtures');

var BASEURL = 'http://localhost:' + settings.port + '/api';

suite('Slugs', function () {

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

  suiteSetup(function (done) {
    server.run(settings, done);
  });

  suiteTeardown(function () {
    server.stop();
  });

  var jar;
  var id;
  var slug;

  setup(function (done) {
    async.series([
      // Clear users
      fixtures.clearUsers,
      // Create a new user
      function (next) {
        fixtures.addUser('User A', function (error, jarA, idA, userA) {
          if (error) { return next(error); }
          jar = jarA;
          next();
        });
      },
      function (next) {
        // Create a survey
        request.post({
          url: BASEURL + '/surveys',
          jar: jar,
          json: data_one
        }, function(error, response, body) {
          if (error) { next(error); }
          id = body.surveys[0].id;
          slug = body.surveys[0].slug;
          next();
        });
      }
    ], function (error) {
      done(error);
    });
  });

  test('Get survey ID for a slug', function (done) {
    request({
      url: BASEURL + '/slugs/' + slug
    }, function (error, response, body) {
      should.not.exist(error);
      response.statusCode.should.equal(200);
      response.should.be.json;

      var parsed = JSON.parse(body);
      parsed.should.have.property('survey');
      parsed.survey.should.equal(id);

      done();
    });
  });

  test('Add two surveys with the same name', function (done) {
    request.post({
      url: BASEURL + '/surveys',
      jar: jar,
      json: data_one
    }, function(error, response, body) {
      should.not.exist(error);
      response.statusCode.should.equal(201);
      response.should.be.json;

      slug.should.not.equal(body.surveys[0].slug);

      done();
    });
  });
});
