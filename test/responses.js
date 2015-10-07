/*jslint node: true, indent: 2, white: true, vars: true */
/*globals suite, test, setup, suiteSetup, suiteTeardown*/
/*jshint -W030*/
'use strict';

var fs = require('fs');

var assert = require('assert');
var async = require('async');
var ObjectId = require('mongoose').Types.ObjectId;
var Promise = require('bluebird');
var request = require('request');
var should = require('should');

var fixtures = require('./data/fixtures.js');
var geojson = require('./lib/geojson');
var server = require('./lib/router');

var Response = require('../lib/models/Response');

var settings = require('../settings.js');

Promise.promisifyAll(request);
Promise.promisifyAll(Response);

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

  suiteTeardown(function (done) {
    server.stop(done);
  });

  suite('POST', function () {
    var surveyId = '123';
    var url = BASEURL + '/surveys/' + surveyId + '/responses';
    test('Posting JSON to /surveys/' + surveyId + '/responses', function (done) {
      request.post({
        url: url,
        json: data_one,
        jar: false
      }, function (error, response, body) {
        assert.ifError(error);
        assert.equal(response.statusCode, 201, 'Status should be 201. Status is ' + response.statusCode);
        response.headers.should.not.have.property('set-cookie');

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

          // Dates
          assert.notEqual(body.responses[i].created, null, 'Response does not have a creation timestamp.');
          assert.notEqual(body.responses[i].modified, null, 'Response does not have a modified timestamp.');
          body.responses[i].created.should.eql(body.responses[i].modified);
        }

        done();
      });
    });

    test('Posting JSON to /surveys/' + surveyId + '/responses with object_id and no parcel_id', function (done) {

      var data = fixtures.makeResponses(1);
      delete data.responses[0].parcel_id;

      request.post({
        url: url,
        json: data,
        jar: false
      }, function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(201);
        response.headers.should.not.have.property('set-cookie');
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

        request.post({
          url: url,
          json: data,
          jar: false
        }, function (error, response, body) {
          should.not.exist(error);
          response.statusCode.should.equal(201);
          response.headers.should.not.have.property('set-cookie');

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

        request.post({
          url: url,
          json: data,
          jar: false
        }, function (error, response, body) {
          should.not.exist(error);
          response.statusCode.should.equal(201);
          response.headers.should.not.have.property('set-cookie');
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

        request.post({
          url: url,
          json: data,
          jar: false
        }, function (error, response, body) {
          should.not.exist(error);
          response.statusCode.should.equal(201);
          response.headers.should.not.have.property('set-cookie');
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

      request.post({
        url: url,
        json: data,
        jar: false
      }, function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(400);
        response.headers.should.not.have.property('set-cookie');

        done();
      });
    });

    test('Posting JSON to /surveys/' + surveyId + '/responses with a null responses object', function () {
      var data = fixtures.makeResponses(1);
      data.responses[0].responses = null;

      return request.postAsync({
        url: url,
        json: data,
        jar: false
      }).spread(function (response, body) {
        response.statusCode.should.equal(400);
        response.headers.should.not.have.property('set-cookie');
      });
    });

    test('Posting a file to /surveys/' + surveyId + '/responses', function (done) {
      this.timeout(5000);
      var req = request.post({
        url: url,
        jar: false
      }, function (error, response, body) {
        assert.ifError(error);
        assert.equal(response.statusCode, 201, 'Status should be 201. Status is ' + response.statusCode);
        response.headers.should.not.have.property('set-cookie');

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

          // Dates
          assert.notEqual(body.responses[i].created, null, 'Response does not have a creation timestamp.');
          assert.notEqual(body.responses[i].modified, null, 'Response does not have a modified timestamp.');
          body.responses[i].created.should.eql(body.responses[i].modified);

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
      var req = request.post({
        url: url,
        jar: false
      }, function (error, response, body) {
        assert.ifError(error);
        assert.equal(response.statusCode, 201, 'Status should be 201. Status is ' + response.statusCode);
        response.headers.should.not.have.property('set-cookie');

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

          // Dates
          assert.notEqual(body.responses[i].created, null, 'Response does not have a creation timestamp.');
          assert.notEqual(body.responses[i].modified, null, 'Response does not have a modified timestamp.');
          body.responses[i].created.should.eql(body.responses[i].modified);

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
        received.should.have.property('modified');

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
          received.should.have.property('modified');

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
      request.post({
        url: url,
        json: {respnoses: {}},
        jar: false
      }, function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(400);
        response.headers.should.not.have.property('set-cookie');
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

            // Confirm the property was modified
            var parsed = JSON.parse(body);
            parsed.should.have.property('response');
            parsed.response.responses.foo.should.equal('bar');

            // Confirm the modified date has updated
            var created = new Date(parsed.response.created);
            var modified = new Date(parsed.response.modified);
            modified.should.be.above(created);

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
      request.patch({
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


  suite('PUT', function () {
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

    test('PUT a modified response', function (done) {
      request.put({
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

            // Confirm the property was modified
            var parsed = JSON.parse(body);
            parsed.should.have.property('response');
            parsed.response.responses.foo.should.equal('bar');

            // An old property should have been erased
            should.not.exist(parsed.response.responses.site);

            // Confirm the modified date has updated
            var created = new Date(parsed.response.created);
            var modified = new Date(parsed.response.modified);
            modified.should.be.above(created);

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

    test('PUT a response we if we\'re not logged in', function (done) {
      request.put({
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

    test('PUT a response not owned by this user', function (done) {
      request.put({
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

    // Per-test setup.
    setup(function () {
      // Create 3 entries, two of which will be part of the same Response doc.
      var parcelBase = Math.floor(10000 * Math.random() + 5000);
      var data = fixtures.makeResponses(2, {
        parcelBase: parcelBase
      });
      this.rawResponses = data.responses.concat(fixtures.makeResponses(1, {
        parcelBase: parcelBase
      }).responses);

      return Promise.bind(this)
      .then(function () {
        return this.rawResponses;
      }).map(function (response) {
        return request.postAsync({
          url: BASEURL + '/surveys/' + surveyId + '/responses',
          json: { responses: [response] },
          jar: ownerJar
        }).spread(function (response, body) {
          return body.responses[0];
        });
      }, {
        concurrency: 1
      }).then(function (responses) {
        this.responses = responses;
      });
    });

    test('Deleting one entry for a base object that has two entries', function () {
      var id = this.responses[0].id;
      var count;
      return request.getAsync({
        url: BASEURL + '/surveys/' + surveyId + '/responses?startIndex=0&count=10000',
        jar: ownerJar
      }).spread(function (response, body) {
        var data = JSON.parse(body);
        count = data.responses.length;

        // Delete the response.
        return request.delAsync({
          url: BASEURL + '/surveys/' + surveyId + '/responses/' + id,
          jar: ownerJar
        });
      }).spread(function(response) {
        should.exist(response);
        response.statusCode.should.equal(204);

        // Try to get the response
        return request.getAsync({
          url: BASEURL + '/surveys/' + surveyId + '/responses/' + id,
          jar: ownerJar
        });
      }).spread(function (response) {
        response.statusCode.should.equal(404);

        // Confirm that we have the correct number of responses after a
        // deletion.
        return request.getAsync({
          url: BASEURL + '/surveys/' + surveyId + '/responses?startIndex=0&count=10000',
          jar: ownerJar
        });
      }).spread(function (response, body) {
        var data = JSON.parse(body);
        data.responses.length.should.equal(count - 1);

        // Comfirm the existence of the zombie response
        return Response.findAsync({
          'properties.survey.deleted': true,
          'properties.survey.id': surveyId  ,
          'entries._id': new ObjectId(id)
        });
      }).then(function (docs) {
        should.exist(docs);
        docs.length.should.equal(1);
      });
    });

    test('Deleting two entries for a base object that has two entries', function () {
      var id0 = this.responses[0].id;
      var id1 = this.responses[2].id;
      var count;
      return request.getAsync({
        url: BASEURL + '/surveys/' + surveyId + '/responses?startIndex=0&count=10000',
        jar: ownerJar
      }).spread(function (response, body) {
        var data = JSON.parse(body);
        count = data.responses.length;

        // Delete the first response.
        return request.delAsync({
          url: BASEURL + '/surveys/' + surveyId + '/responses/' + id0,
          jar: ownerJar
        });
      }).spread(function(response) {
        should.exist(response);
        response.statusCode.should.equal(204);

        // Try to get the response
        return request.getAsync({
          url: BASEURL + '/surveys/' + surveyId + '/responses/' + id0,
          jar: ownerJar
        });
      }).spread(function (response) {
        response.statusCode.should.equal(404);

        // Delete the second response.
        return request.delAsync({
          url: BASEURL + '/surveys/' + surveyId + '/responses/' + id1,
          jar: ownerJar
        });
      }).spread(function(response) {
        should.exist(response);
        response.statusCode.should.equal(204);

        // Try to get the response
        return request.getAsync({
          url: BASEURL + '/surveys/' + surveyId + '/responses/' + id1,
          jar: ownerJar
        });
      }).spread(function (response) {
        response.statusCode.should.equal(404);

        // Confirm that we have the correct number of responses after a
        // deletion.
        return request.getAsync({
          url: BASEURL + '/surveys/' + surveyId + '/responses?startIndex=0&count=10000',
          jar: ownerJar
        });
      }).spread(function (response, body) {
        var data = JSON.parse(body);
        data.responses.length.should.equal(count - 2);

        // Comfirm the existence of the zombie response for the first entry.
        return Response.findAsync({
          'properties.survey.deleted': true,
          'properties.survey.id': surveyId  ,
          'entries._id': new ObjectId(id0)
        });
      }).then(function (docs) {
        should.exist(docs);
        docs.length.should.equal(1);

        // Comfirm the existence of the zombie response for the second entry.
        return Response.findAsync({
          'properties.survey.deleted': true,
          'properties.survey.id': surveyId  ,
          'entries._id': new ObjectId(id1)
        });
      }).then(function (docs) {
        should.exist(docs);
        docs.length.should.equal(1);
      });
    });

    test('Deleting one entry for a base object that has only one entry', function () {
      var id = this.responses[1].id;
      var count;
      return request.getAsync({
        url: BASEURL + '/surveys/' + surveyId + '/responses?startIndex=0&count=10000',
        jar: ownerJar
      }).spread(function (response, body) {
        var data = JSON.parse(body);
        count = data.responses.length;

        // Delete the response.
        return request.delAsync({
          url: BASEURL + '/surveys/' + surveyId + '/responses/' + id,
          jar: ownerJar
        });
      }).spread(function(response) {
        should.exist(response);
        response.statusCode.should.equal(204);

        // Try to get the response
        return request.getAsync({
          url: BASEURL + '/surveys/' + surveyId + '/responses/' + id,
          jar: ownerJar
        });
      }).spread(function (response) {
        response.statusCode.should.equal(404);

        // Confirm that we have the correct number of responses after a
        // deletion.
        return request.getAsync({
          url: BASEURL + '/surveys/' + surveyId + '/responses?startIndex=0&count=10000',
          jar: ownerJar
        });
      }).spread(function (response, body) {
        var data = JSON.parse(body);
        data.responses.length.should.equal(count - 1);

        // Comfirm the existence of the zombie response
        return Response.findAsync({
          'properties.survey.deleted': true,
          'properties.survey.id': surveyId,
          'entries._id': new ObjectId(id)
        });
      }).then(function (docs) {
        should.exist(docs);
        docs.length.should.equal(1);
      });
    });

    test('Deleting an entry with an empty responses hash', function () {
      var raw = fixtures.makeResponses(1);
      raw.responses[0].responses = {};

      var id;
      var count;

      return request.postAsync({
        url: BASEURL + '/surveys/' + surveyId + '/responses',
        json: raw,
        jar: ownerJar
      }).spread(function (response, body) {
        id = body.responses[0].id;

        return request.getAsync({
          url: BASEURL + '/surveys/' + surveyId + '/responses?startIndex=0&count=10000',
          jar: ownerJar
        });
      }).spread(function (response, body) {
        var data = JSON.parse(body);
        count = data.responses.length;

        // Delete the response.
        return request.delAsync({
          url: BASEURL + '/surveys/' + surveyId + '/responses/' + id,
          jar: ownerJar
        });
      }).spread(function(response) {
        should.exist(response);
        response.statusCode.should.equal(204);

        // Try to get the response
        return request.getAsync({
          url: BASEURL + '/surveys/' + surveyId + '/responses/' + id,
          jar: ownerJar
        });
      }).spread(function (response) {
        response.statusCode.should.equal(404);

        // Confirm that we have the correct number of responses after a
        // deletion.
        return request.getAsync({
          url: BASEURL + '/surveys/' + surveyId + '/responses?startIndex=0&count=10000',
          jar: ownerJar
        });
      }).spread(function (response, body) {
        var data = JSON.parse(body);
        data.responses.length.should.equal(count - 1);

        // Comfirm the existence of the zombie response
        return Response.findAsync({
          'properties.survey.deleted': true,
          'properties.survey.id': surveyId  ,
          'entries._id': new ObjectId(id)
        });
      }).then(function (docs) {
        should.exist(docs);
        docs.length.should.equal(1);
      });
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

    setup(function (done) {

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
      request.get({
        url: BASEURL + '/surveys/' + surveyId + '/responses?startIndex=0&count=100000',
        jar: false
      }, function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(200);
        response.should.be.json;
        response.headers.should.not.have.property('set-cookie');

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
      request.get({
        url: BASEURL + '/surveys/' + surveyId + '/responses.geojson?startIndex=0&count=100000',
        jar: false
      }, function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(200);
        response.should.be.json;
        response.headers.should.not.have.property('set-cookie');

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
          feature.properties.should.have.property('modified');
          feature.properties.modified.should.equal(feature.properties.created);
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
      request.get({
        url: BASEURL + '/surveys/' + surveyId + '/responses?objectId=' + data_twenty.responses[1].parcel_id,
        jar: false
      },
       function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(200);
        response.should.be.json;
        response.headers.should.not.have.property('set-cookie');

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
      request.get({
        url: BASEURL + '/surveys/' + surveyId + '/responses?startIndex=0&count=20&collector=' + data_twenty.responses[1].source.collector,
        jar: false
      },
       function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(200);
        response.should.be.json;
        response.headers.should.not.have.property('set-cookie');

        var parsed = JSON.parse(body);
        parsed.should.have.property('responses');
        parsed.responses.length.should.equal(20);
        parsed.responses[0].source.collector.should.equal(data_twenty.responses[1].source.collector);
        parsed.responses[0].survey.should.equal(surveyId);

        done();
      });
    });


    test('Get all responses that match a filter', function (done) {
      request.get({
        url: BASEURL + '/surveys/' + surveyId + '/responses?&startIndex=0&count=20&responses[site]=house',
        jar: false
      },
       function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(200);
        response.should.be.json;
        response.headers.should.not.have.property('set-cookie');

        var parsed = JSON.parse(body);
        parsed.should.have.property('responses');
        parsed.responses.length.should.equal(2);
        parsed.responses[0].responses.site.should.equal('house');

        done();
      });
    });

    test('Get all responses that match a date until filter', function (done) {
      // Get the until date of the first response
      var i;
      var cutoff;

      // Set up our first, baseline response.
      var url = BASEURL + '/surveys/' + surveyId + '/responses';
      var data = fixtures.makeResponses(1);
      request.post({url: url, json: data}, function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(201);
        response.should.be.json;

        cutoff = Date.parse(body.responses[0].created);

        // Set up two more responses
        var data = fixtures.makeResponses(2);
        request.post({url: url, json: data}, function (error, response, body) {

          var url = BASEURL + '/surveys/' + surveyId + '/responses?&startIndex=0&count=10000&until=' + cutoff;
          request.get({url: url },
            function(error, response, body) {
              should.not.exist(error);
              response.statusCode.should.equal(200);
              response.should.be.json;

              var parsed = JSON.parse(body);

              parsed.should.have.property('responses');
              parsed.responses.length.should.equal(21);

              for(i = 0; i < parsed.responses.length; i += 1) {
                var date = new Date(parsed.responses[i].created);
                date.should.be.within(0, cutoff);
              }

              done();
          });
        });
      });
    });

    test('Get all responses that match a date after filter', function (done) {
      // Get the until date of the first response
      var i;
      var cutoff;

      // Set up our first response.
      var url = BASEURL + '/surveys/' + surveyId + '/responses';
      var data = fixtures.makeResponses(1);
      request.post({url: url, json: data}, function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(201);
        response.should.be.json;

        cutoff = new Date(body.responses[0].created);

        // Set up two more responses
        var data = fixtures.makeResponses(2);
        request.post({url: url, json: data}, function (error, response, body) {

          var url = BASEURL + '/surveys/' + surveyId + '/responses?&startIndex=0&count=10000&after=' + cutoff.getTime();
          request.get({url: url },
            function(error, response, body) {
              should.not.exist(error);
              response.statusCode.should.equal(200);
              response.should.be.json;

              var parsed = JSON.parse(body);
              parsed.should.have.property('responses');
              parsed.responses.length.should.equal(2);

              for(i = 0; i < parsed.responses.length; i += 1) {
                var date = new Date(parsed.responses[i].created);
                date.should.be.above(cutoff);
              }
              done();
          });
        });
      });
    });

    test('Get all responses that match an until and after filter', function (done) {
      // Get the until date of the first response

      // Set up our first response.
      var url = BASEURL + '/surveys/' + surveyId + '/responses';
      var data = fixtures.makeResponses(1);
      request.post({url: url, json: data}, function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(201);
        response.should.be.json;

        var after = new Date(body.responses[0].created);

        // Set up two more responses
        var data = fixtures.makeResponses(2);
        request.post({url: url, json: data}, function (error, response, body) {

          var until = new Date(body.responses[0].created);

          var url = BASEURL + '/surveys/' + surveyId + '/responses?&startIndex=0&count=10000&after=' + after.getTime() + '&until=' + until.getTime();
          request.get({url: url },
            function(error, response, body) {
              should.not.exist(error);
              response.statusCode.should.equal(200);
              response.should.be.json;

              var parsed = JSON.parse(body);
              parsed.should.have.property('responses');
              parsed.responses.length.should.equal(1);

              var date = new Date(parsed.responses[0].created);
              date.should.be.above(after);
              date.should.be.within(after, until);

              done();
          });
        });
      });
    });

    test('Get all responses that do not have a particular response', function (done) {
      request.get({
        url: BASEURL + '/surveys/' + surveyId + '/responses?&startIndex=0&count=20&responses[doesnotexist]=undefined',
        jar: false
      },
       function (error, response, body) {
        var i;
        should.not.exist(error);
        response.statusCode.should.equal(200);
        response.should.be.json;
        response.headers.should.not.have.property('set-cookie');

        var parsed = JSON.parse(body);
        parsed.should.have.property('responses');
        parsed.responses.length.should.equal(20);
        for (i = 0; i < parsed.responses.length; i += 1) {
          parsed.responses[i].responses.should.not.have.property('doesnotexist');
        }

        done();
      });
    });

    test('one response', function (done) {
      request.get({
        url: BASEURL + '/surveys/' + surveyId + '/responses/' + id,
        jar: false
      }, function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(200);
        response.should.be.json;
        response.headers.should.not.have.property('set-cookie');

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
      request.get({
        url: url,
        jar: false
      }, function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(200);
        response.should.be.json;
        response.headers.should.not.have.property('set-cookie');

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
      request.get({
        url: BASEURL + '/surveys/' + surveyId + '/responses?startIndex=5&count=10',
        jar: false
      }, function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(200);
        response.should.be.json;
        response.headers.should.not.have.property('set-cookie');

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
      request.get({
        url: BASEURL + '/surveys/' + surveyId + '/responses?startIndex=0&count=100000&sort=asc',
        jar: false
      }, function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(200);
        response.should.be.json;
        response.headers.should.not.have.property('set-cookie');

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
