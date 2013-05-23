/*jslint node: true */
/*globals suite, test, setup, suiteSetup, suiteTeardown, done, teardown */
'use strict';

var server = require('../lib/server.js');
var request = require('request');
var should = require('should');
var async = require('async');

var User = require('../lib/models/User.js');

var settings = require('../settings-test.js');
var fixtures = require('./data/fixtures');

var BASEURL = 'http://localhost:' + settings.port + '/api';

suite('Shapefile', function () {

  var data_survey = {
    name: 'Test Survey',
    type: 'parcel'
  };

  var data_twenty = (function () {
    function makeResponse(parcelId) {
      return {
        source: {
          type: 'mobile',
          collector: 'Name'
        },
        geo_info: {
          geometry: {
            type: 'MultiPolygon',
            coordinates: [ [ [
              [-122.43469523018862, 37.771087088400655],
              [-122.43477071284453, 37.77146083403105],
              [-122.4346853083731, 37.77147170307505],
              [-122.43460982859321, 37.771097964560134],
              [-122.43463544873167, 37.77109470163426],
              [-122.43469523018862, 37.771087088400655]
            ] ] ]
          },
          centroid: [-122.43469027023522, 37.77127939798119],
          humanReadableName: '763 HAIGHT ST',
          parcel_id: parcelId
        },
        parcel_id: parcelId,
        object_id: parcelId,
        responses: {
          'use-count': '1',
          collector: 'Some Name',
          site: 'parking-lot',
          'condition-1': 'demolish'
        }
      };
    }
    var data = { responses: [] };
    var parcelBase = 123456;
    var i;
    for (i = 0; i < 20; i += 1) {
      data.responses.push(makeResponse((parcelBase + i).toString()));
    }
    return data;
  }());

  suiteSetup(function (done) {
    server.run(settings, done);
  });

  suiteTeardown(function () {
    server.stop();
  });


  suite('GET', function () {
    var surveyId;
    var id;
    var jar;

    suiteSetup(function (done) {
      async.waterfall([
        fixtures.clearUsers,
        function (next) {
          // Create a user.
          fixtures.addUser('Test Testson', function (error, authJar, userId) {
            if (error) { return next(error); }
            jar = authJar;
            next();
          });
        },
        function (next) {
          // Create a survey.
          request.post({
            url: BASEURL + '/surveys',
            json: { surveys: data_survey },
            jar: jar
          }, next);
        },
        function (response, body, next) {
          surveyId = body.surveys[0].id;
          // Add some responses.
          request.post({
            url: BASEURL + '/surveys/' + surveyId + '/responses',
            json: data_twenty,
            jar: jar
          }, next);
        }
      ], done);
    });


    test('shapfile for a survey', function (done) {
      // Initial request for processing.
      request.get({
        url: BASEURL + '/surveys/' + surveyId + '/responses.zip',
        jar: jar
      }, function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(202);

        // Check back to get the URL.
        request.get({
          url: BASEURL + '/surveys/' + surveyId + '/responses.zip',
          jar: jar,
          followRedirects: false
        }, function (error, response, body) {
          should.not.exist(error);
          response.statusCode.should.equal(307);

          var location = body.split(': ')[1];

          // Give ourselves 1.5 seconds to get the exported file.
          var limit = Date.now() + 1.5 * 1000;
          var found = false;

          async.whilst(
            function () { return !found && Date.now() < limit; },
            function (next) {
              // Check for the exported ZIP file.
              request.get({ url: location }, function (error, response, body) {
                should.not.exist(error);
                response.headers.should.have.property('content-type');
                found = response.headers['content-type'] === 'application/zip';
                next();
              });
            },
            function (error) {
              if (error) { return done(error); }
              found.should.equal(true);
              done();
            }
          );
        });
      });

    });


  });
});
