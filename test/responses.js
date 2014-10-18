/*jslint node: true, indent: 2, white: true, vars: true */
/*globals suite, test, setup, suiteSetup, suiteTeardown, done, teardown */
'use strict';

var server = require('./lib/router');
var assert = require('assert');
var fixtures = require('./data/fixtures.js');
var fs = require('fs');
var util = require('util');
var request = require('request');
var should = require('should');
var geojson = require('./lib/geojson');
var async = require('async');

var Response = require('../lib/models/Response');

var settings = require('../settings.js');
// We don't use filtering right now, so we'll skip testing it
// var filterToRemoveResults = require('../responses.js').filterToRemoveResults;

var BASEURL = 'http://localhost:' + settings.port + '/api';
var FILENAME = __dirname + '/data/scan.jpeg';

suite('Responses', function () {
  // Set up some fixtures
  var data_one = fixtures.makeResponses(1);
  var data_two = fixtures.makeResponses(2);
  var data_twenty = fixtures.makeResponses(20);

  // Mix up data_twenty a bit for testing different areas
  data_twenty.responses[18].responses.site = 'house';
  data_twenty.responses[19].responses.site = 'house';

  suiteSetup(function (done) {
    server.run(function (error) {
      if (error) { return done(error); }
      // We need the geo index to be in place, but we don't automatically
      // create indexes to avoid ill-timed index creation on production
      // systems.
      Response.ensureIndexes(done);
    });
  });

  suiteTeardown(function () {
    server.stop();
  });

  suite('POST', function () {
    var surveyId = '123';
    var url = BASEURL + '/surveys/' + surveyId + '/responses';
    test('Posting JSON to /surveys/' + surveyId + '/responses', function (done) {
      request.post({url: url, json: data_one}, function (error, response, body) {
        assert.ifError(error);
        assert.equal(response.statusCode, 201, 'Status should be 201. Status is ' + response.statusCode);

        var i;
        for (i = 0; i < data_one.responses.length; i += 1) {
          // Source
          assert.deepEqual(data_one.responses[i].source, body.responses[i].source, 'Response differs from posted data');
          // Centroid
          assert.deepEqual(data_one.responses[i].geo_info.centroid,
                           body.responses[i].geo_info.centroid,
                           'Response centroid differs from posted data');
          // Parcel ID in geo_info
          data_one.responses[i].geo_info.parcel_id.should.equal(body.responses[i].geo_info.parcel_id);
          // Geometry
          assert.deepEqual(data_one.responses[i].geo_info.geometry,
                           body.responses[i].geo_info.geometry,
                           'Response geometry differs from posted data');
          // Human-readable name
          data_one.responses[i].geo_info.humanReadableName.should.equal(body.responses[i].geo_info.humanReadableName);

          // Object ID
          assert.deepEqual(data_one.responses[i].object_id, body.responses[i].object_id, 'Response differs from posted data');
          // Answers
          assert.deepEqual(data_one.responses[i].responses, body.responses[i].responses, 'Response differs from posted data');

          assert.notEqual(body.responses[i].id, null, 'Response does not have an ID.');
          assert.equal(body.responses[i].survey, surveyId,
                       'Response does not indicate the correct survey: ' +
                       body.responses[i].survey + ' vs ' + surveyId);
          assert.notEqual(body.responses[i].created, null, 'Response does not have a creation timestamp.');
        }

        done();
      });
    });

    test('Posting JSON to /surveys/' + surveyId + '/responses with object_id and no parcel_id', function (done) {

      var data = fixtures.makeResponses(1);
      delete data.responses[0].parcel_id;

      request.post({url: url, json: data}, function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(201);
        body.responses[0].should.have.property('object_id');
        body.responses[0].should.have.property('parcel_id');
        body.responses[0].object_id.should.equal(data.responses[0].object_id);
        body.responses[0].parcel_id.should.equal(data.responses[0].object_id);

        done();
      });
    });

    test('Posting JSON to /surveys/' + surveyId + '/responses with an info field', function (done) {

      fixtures.clearResponses(surveyId, function() {
        var data = fixtures.makeResponses(1, { includeInfo: true });

        request.post({url: url, json: data}, function (error, response, body) {
          should.not.exist(error);
          response.statusCode.should.equal(201);

          body.responses[0].should.have.property('info');
          // Check equivalent content of the info fields.
          assert.deepEqual(body.responses[0].info, data.responses[0].info);

          done();
        });
      });
    });


    test('Posting JSON to /surveys/' + surveyId + '/responses with an info field after not having one', function (done) {
      // Because we upsert response.enries and don't modify the original response
      // properties, adding an info field to a response that doesn't have one
      // should result in no change.

      fixtures.clearResponses(surveyId, function() {
        var data = fixtures.makeResponses(1);

        request.post({url: url, json: data}, function (error, response, body) {
          should.not.exist(error);
          response.statusCode.should.equal(201);
          body.responses[0].should.not.have.property('info');

          // Now add an info field.
          // It shouldn't change the existing results.
          var data = fixtures.makeResponses(1, { includeInfo: true });
          request.post({url: url, json: data}, function (error, response, body) {
            should.not.exist(error);
            response.statusCode.should.equal(201);
            body.responses[0].should.not.have.property('info');
            done();
          });
        });
      });
    });


    test('Posting JSON to /surveys/' + surveyId + '/responses without an info field does not remove existing data', function (done) {
      // Because we upsert response.enries and don't modify the original response
      // properties, removing an info field from a response that already has one
      // should result in no change -- and especially no data loss.

      fixtures.clearResponses(surveyId, function() {
        var data = fixtures.makeResponses(1, { includeInfo: true });

        request.post({url: url, json: data}, function (error, response, body) {
          should.not.exist(error);
          response.statusCode.should.equal(201);
          body.responses[0].should.have.property('info');

          // Now add an info field.
          // It shouldn't change the existing results.
          var data2 = fixtures.makeResponses(1);
          request.post({url: url, json: data2}, function (error, response, body) {
            should.not.exist(error);
            response.statusCode.should.equal(201);
            body.responses[0].should.have.property('info');
            assert.deepEqual(body.responses[0].info, data.responses[0].info);
            done();
          });
        });
      });
    });


    test('Posting JSON to /surveys/' + surveyId + '/responses without a responses object', function (done) {

      var data = fixtures.makeResponses(1);
      delete data.responses[0].responses;

      request.post({url: url, json: data}, function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(400);

        done();
      });
    });

    test('Posting a file to /surveys/' + surveyId + '/responses', function (done) {
      this.timeout(5000);
      var req = request.post({url: url}, function (error, response, body) {
        assert.ifError(error);
        assert.equal(response.statusCode, 201, 'Status should be 201. Status is ' + response.statusCode);

        body = JSON.parse(body);

        var i;
        for (i = 0; i < data_one.responses.length; i += 1) {
          // Source
          assert.deepEqual(data_one.responses[i].source, body.responses[i].source, 'Response differs from posted data');
          // Centroid
          assert.deepEqual(data_one.responses[i].geo_info.centroid,
                           body.responses[i].geo_info.centroid,
                           'Response centroid differs from posted data');
          // Geometry
          assert.deepEqual(data_one.responses[i].geo_info.geometry,
                           body.responses[i].geo_info.geometry,
                           'Response geometry differs from posted data');
          // Human-readable name
          data_one.responses[i].geo_info.humanReadableName.should.equal(body.responses[i].geo_info.humanReadableName);

          // Object ID
          assert.deepEqual(data_one.responses[i].parcel_id, body.responses[i].parcel_id, 'Response differs from posted data');
          assert.deepEqual(data_one.responses[i].object_id, body.responses[i].object_id, 'Response differs from posted data');
          // Answers
          assert.deepEqual(data_one.responses[i].responses, body.responses[i].responses, 'Response differs from posted data');

          assert.notEqual(body.responses[i].id, null, 'Response does not have an ID.');
          assert.equal(body.responses[i].survey, surveyId,
                       'Response does not indicate the correct survey: ' +
                       body.responses[i].survey + ' vs ' + surveyId);
          assert.notEqual(body.responses[i].created, null, 'Response does not have a creation timestamp.');

          // Files
          body.responses[i].should.have.property('files');
          body.responses[i].files.length.should.equal(1);
        }

        done();
      });

      var form = req.form();

      form.append('my_file', fs.createReadStream(FILENAME));
      var dataAsString = JSON.stringify(data_one);
      form.append('data', dataAsString);
    });


    test('Posting a file without a human-readable name to /surveys/' + surveyId + '/responses', function (done) {
      this.timeout(5000);
      var req = request.post({url: url}, function (error, response, body) {
        assert.ifError(error);
        assert.equal(response.statusCode, 201, 'Status should be 201. Status is ' + response.statusCode);

        body = JSON.parse(body);

        var i;
        for (i = 0; i < data_one.responses.length; i += 1) {
          // Source
          assert.deepEqual(data_one.responses[i].source, body.responses[i].source, 'Response differs from posted data');
          // Centroid
          assert.deepEqual(data_one.responses[i].geo_info.centroid,
                           body.responses[i].geo_info.centroid,
                           'Response centroid differs from posted data');
          // Geometry
          assert.deepEqual(data_one.responses[i].geo_info.geometry,
                           body.responses[i].geo_info.geometry,
                           'Response geometry differs from posted data');
          // Human-readable name
          data_one.responses[i].geo_info.humanReadableName.should.equal(body.responses[i].geo_info.humanReadableName);

          // Object ID
          assert.deepEqual(data_one.responses[i].parcel_id, body.responses[i].parcel_id, 'Response differs from posted data');
          assert.deepEqual(data_one.responses[i].object_id, body.responses[i].object_id, 'Response differs from posted data');
          // Answers
          assert.deepEqual(data_one.responses[i].responses, body.responses[i].responses, 'Response differs from posted data');

          assert.notEqual(body.responses[i].id, null, 'Response does not have an ID.');
          assert.equal(body.responses[i].survey, surveyId,
                       'Response does not indicate the correct survey: ' +
                       body.responses[i].survey + ' vs ' + surveyId);
          assert.notEqual(body.responses[i].created, null, 'Response does not have a creation timestamp.');

          // Files
          body.responses[i].should.have.property('files');
          body.responses[i].files.length.should.equal(1);
        }

        done();
      });

      var form = req.form();

      form.append('my_file', fs.createReadStream(FILENAME));

      // REMOVE the human readable name before posting
      var data = fixtures.makeResponses(1);
      delete data.responses[0].geo_info.humanReadableName;

      var dataAsString = JSON.stringify(data);
      form.append('data', dataAsString);
    });

    test('Posting a file with no human-readable name and no object_id', function (done) {
      // Post initial response/file
      var req = request.post({
        url: url,
        jar: false
      }, function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(400);

        done();
      });

      var form = req.form();
      form.append('my_file', fs.createReadStream(FILENAME));

      // Remove the human readable name before posting
      var data = fixtures.makeResponses(1);
      delete data.responses[0].geo_info.humanReadableName;

      // Remove the object_id before posting
      delete data.responses[0].object_id;

      form.append('data', JSON.stringify(data));
    });

    test('Posting two files of the same feature', function (done) {
      var name1;
      var name2;

      // Post initial response/file
      var req1 = request.post({
        url: url,
        jar: false
      }, function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(201);

        body = JSON.parse(body);
        body.should.have.property('responses');
        body.responses.should.have.length(1);

        var orig = data_one.responses[0];
        var received = body.responses[0];

        // Source
        received.source.should.eql(orig.source);
        // Centroid
        received.geo_info.centroid.should.eql(orig.geo_info.centroid);
        // Geometry
        received.geo_info.geometry.should.eql(orig.geo_info.geometry);
        // Human-readable name
        received.geo_info.humanReadableName.should.eql(orig.geo_info.humanReadableName);

        // Object ID
        received.parcel_id.should.eql(orig.parcel_id);
        received.object_id.should.eql(orig.object_id);
        // Answers
        received.responses.should.eql(orig.responses);

        received.should.have.property('id');
        received.should.have.property('survey');
        received.survey.should.equal(surveyId);
        received.should.have.property('created');

        // Files
        received.should.have.property('files');
        received.files.length.should.equal(1);

        name1 = received.files[0];

        // Post duplicate response/file.
        var req2 = request.post({
          url: url,
          jar: false
        }, function (error, response, body) {
          should.not.exist(error);
          response.statusCode.should.equal(201);

          body = JSON.parse(body);
          body.should.have.property('responses');
          body.responses.should.have.length(1);

          var orig = data_one.responses[0];
          var received = body.responses[0];

          // Source
          received.source.should.eql(orig.source);
          // Centroid
          received.geo_info.centroid.should.eql(orig.geo_info.centroid);
          // Geometry
          received.geo_info.geometry.should.eql(orig.geo_info.geometry);
          // Human-readable name
          received.geo_info.humanReadableName.should.eql(orig.geo_info.humanReadableName);

          // Object ID
          received.parcel_id.should.eql(orig.parcel_id);
          received.object_id.should.eql(orig.object_id);
          // Answers
          received.responses.should.eql(orig.responses);

          received.should.have.property('id');
          received.should.have.property('survey');
          received.survey.should.equal(surveyId);
          received.should.have.property('created');

          // Files
          received.should.have.property('files');
          received.files.length.should.equal(1);

          name2 = received.files[0];

          name1.should.not.equal(name2);

          done();
        });

        var form2 = req2.form();
        form2.append('my_file', fs.createReadStream(FILENAME));
        var data2 = JSON.stringify(data_one);
        form2.append('data', data2);
      });

      var form1 = req1.form();
      form1.append('my_file', fs.createReadStream(FILENAME));
      var data1 = JSON.stringify(data_one);
      form1.append('data', data1);
    });


    test('Posting bad data to /surveys/' + surveyId + '/responses', function (done) {
      request.post({url: url, json: {respnoses: {}}}, function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(400);
        done();
      });
    });
  });


  suite('PATCH', function () {
    var surveyId;
    var id, id2, id3;
    var ownerJar, strangerJar;

    suiteSetup(function (done) {
      // Create an account...
      fixtures.setupUser(function(error, jar1, jar2) {
        should.exist(jar1);
        should.exist(jar2);

        ownerJar = jar1;
        strangerJar = jar2;

        // Create a test survey owned by this user.
        request.post({url: BASEURL + '/surveys', json: fixtures.surveys, jar: ownerJar}, function (error, response, body) {
          should.not.exist(error);
          should.exist(body);
          surveyId = body.surveys[0].id;

          // Add a response
          request.post({url: BASEURL + '/surveys/' + surveyId + '/responses', json: data_two, jar: ownerJar},
            function (error, response, body) {
            should.not.exist(error);
            should.exist(body);
            id = body.responses[0].id;
            id2 = body.responses[1].id;

            // Add another response with the same objectId as #1
            var sameAsOne = fixtures.makeResponses(1);
            sameAsOne.parcel_id = body.responses[0].parcel_id;
            sameAsOne.object_id = body.responses[0].parcel_id;
            request.post({url: BASEURL + '/surveys/' + surveyId + '/responses', json: sameAsOne, jar: ownerJar},
            function (error, response, body) {
              should.not.exist(error);
              should.exist(body);
              id3 = body.responses[0].id;
              done();
            });

          });
        });
      });
    });

    test('Patching a response', function (done) {

      request.patch({
          url: BASEURL + '/surveys/' + surveyId + '/responses/' + id,
          json: {
            responses: {
              foo: 'bar'
            }
          },
          jar: ownerJar
        },
        function(error, response) {
          should.not.exist(error);
          should.exist(response);
          response.statusCode.should.equal(204);

          // Check to make sure something was changed.
          request.get({
            url: BASEURL + '/surveys/' + surveyId + '/responses/' + id,
            jar: ownerJar
          }, function (error, response, body) {
            should.not.exist(error);
            response.statusCode.should.equal(200);
            response.should.be.json;

            var parsed = JSON.parse(body);
            parsed.should.have.property('response');
            parsed.response.responses.foo.should.equal('bar');

            // Check to make sure the other response for the same object
            // was NOT changed
            request.get({
              url: BASEURL + '/surveys/' + surveyId + '/responses/' + id3,
              jar: ownerJar
            }, function (error, response, body) {
              should.not.exist(error);
              response.statusCode.should.equal(200);
              response.should.be.json;

              var parsed = JSON.parse(body);
              parsed.should.have.property('response');
              should.not.exist(parsed.response.responses.foo);
              done();
            });
          });
        }
      );
    });


    test('Patching a response we if we\'re not logged in', function (done) {
      request.del({
        url: BASEURL + '/surveys/' + surveyId + '/responses/' + id2,
        json: {
          foo: 'bar'
        },
        jar: request.jar()
      },
        function(error, response) {
          should.not.exist(error);
          should.exist(response);
          response.statusCode.should.equal(401);
          done();
        }
      );
    });

    test('Patching a response not owned by this user', function (done) {
      request.patch({
        url: BASEURL + '/surveys/' + surveyId + '/responses/' + id2,
        json: {
          foo: 'bar'
        },
        jar: strangerJar
      },
        function(error, response) {
          should.not.exist(error);
          should.exist(response);
          response.statusCode.should.equal(403);
          done();
        }
      );
    });

  });


  suite('DEL', function () {
    var surveyId;
    var id, id2;
    var ownerJar, strangerJar;

    suiteSetup(function (done) {
      // Create an account...
      fixtures.setupUser(function(error, jar1, jar2) {
        should.exist(jar1);
        should.exist(jar2);

        ownerJar = jar1;
        strangerJar = jar2;

        // Create a test survey owned by this user.
        request.post({url: BASEURL + '/surveys', json: fixtures.surveys, jar: ownerJar}, function (error, response, body) {
          should.not.exist(error);
          should.exist(body);
          surveyId = body.surveys[0].id;

          // Add a response
          request.post({url: BASEURL + '/surveys/' + surveyId + '/responses', json: data_two, jar: ownerJar},
            function (error, response, body) {
            should.not.exist(error);
            should.exist(body);
            id = body.responses[0].id;
            id2 = body.responses[1].id;
            done();
          });
        });
      });
    });

    test('Deleting a response', function (done) {

      // Delete the response.
      request.del({
          url: BASEURL + '/surveys/' + surveyId + '/responses/' + id,
          jar: ownerJar
        },
        function(error, response) {
          should.not.exist(error);
          should.exist(response);
          response.statusCode.should.equal(204);

          // Try to get the response
          request.get({
            url: BASEURL + '/surveys/' + surveyId + '/responses/' + id,
            jar: ownerJar
          }, function (error, response) {
            should.not.exist(error);
            response.statusCode.should.equal(404);
            done();
          });
        }
      );
    });

    test('Deleting a response we if we\'re not logged in', function (done) {
      request.del({
        url: BASEURL + '/surveys/' + surveyId + '/responses/' + id2,
        jar: request.jar()
      },
        function(error, response) {
          should.not.exist(error);
          should.exist(response);
          response.statusCode.should.equal(401);
          done();
        }
      );
    });

    test('Deleting a response not owned by this user', function (done) {
      request.del({
        url: BASEURL + '/surveys/' + surveyId + '/responses/' + id2,
        jar: strangerJar
      },
        function(error, response) {
          should.not.exist(error);
          should.exist(response);
          response.statusCode.should.equal(403);
          done();
        }
      );
    });
  });

  suite('GET', function () {
    var surveyId;
    var id;
    var ownerJar;
    var strangerJar;

    suiteSetup(function (done) {
      async.series([
        // Clear existing responses.
        fixtures.clearResponses.bind(fixtures, surveyId),
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
        // Add responses.
        function (next) {
          request.post({
            url: BASEURL + '/surveys/' + surveyId + '/responses',
            json: data_twenty
          }, function (error, response, body) {
            if (!error) {
              id = body.responses[0].id;
            }
            next(error);
          });
        }
      ], done);
    });

    test(' all responses for a survey', function (done) {
      request.get({url: BASEURL + '/surveys/' + surveyId + '/responses?startIndex=0&count=100000'}, function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(200);
        response.should.be.json;

        var parsed = JSON.parse(body);
        parsed.should.have.property('responses');
        parsed.responses.length.should.be.above(1);
        var i;
        var prevTime = Number.MAX_VALUE;
        var created;
        for (i = 0; i < parsed.responses.length; i += 1) {
          parsed.responses[i].survey.should.equal(surveyId);
          created = Date.parse(parsed.responses[i].created);
          created.should.not.be.above(prevTime);
          prevTime = created;
        }
        done();
      });
    });

    test(' all responses for a survey as GeoJSON', function (done) {
      request.get({url: BASEURL + '/surveys/' + surveyId + '/responses.geojson?startIndex=0&count=100000'}, function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(200);
        response.should.be.json;

        var parsed = JSON.parse(body);
        geojson.shouldBeFeatureCollection(parsed);
        parsed.features.length.should.be.above(1);

        var i;
        var prevTime = Number.MAX_VALUE;
        var created;
        var feature;
        for (i = 0; i < parsed.features.length; i += 1) {
          feature = parsed.features[i];
          feature.properties.should.have.property('survey');
          feature.properties.survey.should.equal(surveyId);
          feature.properties.should.have.property('created');
          created = Date.parse(feature.properties.created);
          created.should.not.be.above(prevTime);
          feature.properties.should.have.property('source');
          feature.properties.should.have.property('responses');
          prevTime = created;
        }
        done();
      });
    });


    test('Get all responses for a specific parcel', function (done) {
      request.get({url: BASEURL + '/surveys/' + surveyId + '/responses?objectId=' + data_twenty.responses[1].parcel_id},
       function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(200);
        response.should.be.json;

        var parsed = JSON.parse(body);
        parsed.should.have.property('responses');
        parsed.responses.length.should.be.above(0);
        parsed.responses[0].object_id.should.equal(data_twenty.responses[1].object_id);
        parsed.responses[0].survey.should.equal(surveyId);

        var i;
        var prevTime = Number.MAX_VALUE;
        var created;
        for (i = 0; i < parsed.responses.length; i += 1) {
          parsed.responses[i].survey.should.equal(surveyId);

          created = Date.parse(parsed.responses[i].created);
          created.should.not.be.above(prevTime);
          prevTime = created;
        }

        done();
      });
    });

    test('Get all responses for a specific collector', function (done) {
      request.get({url: BASEURL + '/surveys/' + surveyId + '/responses?startIndex=0&count=20&collector=' + data_twenty.responses[1].source.collector },
       function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(200);
        response.should.be.json;

        var parsed = JSON.parse(body);
        parsed.should.have.property('responses');
        parsed.responses.length.should.equal(20);
        parsed.responses[0].source.collector.should.equal(data_twenty.responses[1].source.collector);
        parsed.responses[0].survey.should.equal(surveyId);

        done();
      });
    });


    test('Get all responses that match a filter', function (done) {
      request.get({url: BASEURL + '/surveys/' + surveyId + '/responses?&startIndex=0&count=20&responses[site]=house' },
       function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(200);
        response.should.be.json;

        var parsed = JSON.parse(body);
        parsed.should.have.property('responses');
        parsed.responses.length.should.equal(2);
        parsed.responses[0].responses.site.should.equal('house');

        done();
      });
    });


    test('Get all responses that do not have a particular response', function (done) {
      request.get({url: BASEURL + '/surveys/' + surveyId + '/responses?&startIndex=0&count=20&responses[doesnotexist]=undefined' },
       function (error, response, body) {
        var i;
        should.not.exist(error);
        response.statusCode.should.equal(200);
        response.should.be.json;

        var parsed = JSON.parse(body);
        parsed.should.have.property('responses');
        parsed.responses.length.should.equal(20);
        for (i = 0; i < parsed.responses.length; i++) {
          parsed.responses[i].responses.should.not.have.property('doesnotexist');
        }

        done();
      });
    });

    test('one response', function (done) {
      request.get({url: BASEURL + '/surveys/' + surveyId + '/responses/' + id},
                  function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(200);
        response.should.be.json;

        var parsed = JSON.parse(body);

        parsed.response.id.should.equal(id);
        should.deepEqual(parsed.response.source, data_twenty.responses[0].source);
        should.deepEqual(parsed.response.geo_info, data_twenty.responses[0].geo_info);
        should.deepEqual(parsed.response.responses, data_twenty.responses[0].responses);
        parsed.response.object_id.should.equal(data_twenty.responses[0].object_id);
        parsed.response.survey.should.equal(surveyId);

        done();
      });
    });

    test('Get all responses in a bounding box', function (done) {
      var center = data_twenty.responses[0].geo_info.centroid;
      var bbox = [center[0] - 0.1, center[1] - 0.1, center[0] + 0.1, center[1] + 0.1];
      var url = BASEURL + '/surveys/' + surveyId + '/responses?bbox=' + bbox.join(',');
      request.get({url: url}, function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(200);
        response.should.be.json;

        var parsed = JSON.parse(body);
        parsed.should.have.property('responses');
        parsed.responses.length.should.be.above(0);
        var i;
        var prevTime = Number.MAX_VALUE;
        var created;
        for (i = 0; i < parsed.responses.length; i += 1) {
          parsed.responses[i].survey.should.equal(surveyId);
          parsed.responses[i].geo_info.centroid.should.have.lengthOf(2);
          parsed.responses[i].geo_info.centroid[0].should.be.above(bbox[0]);
          parsed.responses[i].geo_info.centroid[0].should.be.below(bbox[2]);
          parsed.responses[i].geo_info.centroid[1].should.be.above(bbox[1]);
          parsed.responses[i].geo_info.centroid[1].should.be.below(bbox[3]);

          created = Date.parse(parsed.responses[i].created);
          created.should.not.be.above(prevTime);
          prevTime = created;
        }
        done();
      });
    });

    test('Get a chunk of responses', function (done) {
      request.get({url: BASEURL + '/surveys/' + surveyId + '/responses?startIndex=5&count=10'}, function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(200);
        response.should.be.json;

        var parsed = JSON.parse(body);
        parsed.should.have.property('responses');
        // Make sure we got the number we requested.
        parsed.responses.length.should.equal(10);

        // Make sure the responses are in descending order of creation time.
        var i;
        var prevTime = Number.MAX_VALUE;
        var created;
        for (i = 0; i < parsed.responses.length; i += 1) {
          parsed.responses[i].survey.should.equal(surveyId);

          created = Date.parse(parsed.responses[i].created);
          created.should.not.be.above(prevTime);
          prevTime = created;
        }

        // Make sure we got the right range of responses.
        request.get({url: BASEURL + '/surveys/' + surveyId + '/responses?startIndex=0&count=100000'}, function (error, response, body) {
          var full = JSON.parse(body);
          full.responses[5].geo_info.parcel_id.should.equal(parsed.responses[0].geo_info.parcel_id);
          done();
        });
      });
    });

    test('Get responses in ascending creation order', function (done) {
      request.get({url: BASEURL + '/surveys/' + surveyId + '/responses?startIndex=0&count=100000&sort=asc'}, function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(200);
        response.should.be.json;

        var parsed = JSON.parse(body);
        parsed.should.have.property('responses');

        // Make sure the responses are in ascending order of creation time.
        var i;
        var prevTime = Number.MIN_VALUE;
        var created;
        for (i = 0; i < parsed.responses.length; i += 1) {
          parsed.responses[i].survey.should.equal(surveyId);

          created = Date.parse(parsed.responses[i].created);
          created.should.not.be.below(prevTime);
          prevTime = created;
        }

        done();
      });
    });
  });
});
