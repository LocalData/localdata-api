/*jslint node: true, indent: 2, white: true, vars: true */
/*globals suite, test, setup, suiteSetup, suiteTeardown, done, teardown */
'use strict';

var assert = require('assert');
var async = require('async');
var Promise = require('bluebird');
var request = require('request');
var should = require('should');
var util = require('util');

var Survey = require('../lib/models/Survey');

var server = require('./lib/router');
var fixtures = require('./data/fixtures');
var settings = require('../settings');


var BASEURL = 'http://localhost:' + settings.port + '/api';

Promise.promisifyAll(request);

suite('Surveys', function () {

  var data_one = {
    "surveys" : [ {
      "name": "Just a survey",
      "location": "Detroit",
      "timezone": "America/Detroit",
      "users": ["A", "B"]
    } ]
  };

  var data_two = {
    "surveys" : [ {
      "name": "Test survey 1",
      "location": "Detroit",
      "timezone": "America/Detroit",
      "type": "parcel",
      "errantStuff": "foo"
    }, {
      "name": "Test survey 2",
      "users": ["2"],
      "type": "pointandparcel",
      "errantStuff": 12345,
      "responseLongevity": 5,
      "surveyOptions": {
        "foo": "bar"
      },
      "geoObjectSource": {
        "type": "foo"
      }
    } ]
  };

  var sampleSurvey = {
    "name": "Sample survey",
    "slug": "sample-survey",
    "id": "1234",
    "users": ["2"]
  };

  var data_bad = {
    "surveys" : [ {
      "slug": "this's no good!!",
      "paperpaper": { "dpi" : null }
    } ]
  };

  var userA;
  var userB;
  var userAJar;
  var userBJar;

  var data_slug = {
    "surveys" : [ {
      "name": "Someone's cool, \"hip\" survey ~!@#$%^&*()-=_+<>?,./;: title",
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

  suiteSetup(function (done) {
    async.series([
      function (next) {
        server.run(next);
      },
      fixtures.clearSurveys,
      fixtures.clearUsers,
      function (next) {
        fixtures.addUser('User A', function (error, jar, id, user) {
          if (error) { return next(error); }
          userAJar = jar;
          userA = user;
          next();
        });
      },
      function (next) {
        fixtures.addUser('User B', function (error, jar, id, user) {
          if (error) { return next(error); }
          userBJar = jar;
          userB = user;
          next();
        });
      }
    ], done);
  });

  suiteTeardown(function (done) {
    server.stop(done);
  });

  suite("Utilities:", function() {
    test('Check if survey is owned by a user', function (done) {
      var url = BASEURL + '/surveys';
      var surveyId;
      var userId = '123';

      // If a survey doesn't exist, it shouldn't be found
      Survey.findIfOwnedByUser(surveyId, userId, function(error, s) {
        error.code.should.equal(404);
      });

      // Create a user and add a survey
      //fixtures.setupUser(function(error, jar, jar2, userId){
      request.post({
        url: url,
        json: data_two,
        jar: userAJar
      }, function (error, response, body) {
        surveyId = body.surveys[0].id;

        // Try to find the survey
        Survey.findIfOwnedByUser(surveyId, userA._id, function(error, survey) {
          should.not.exist(error);
          survey.id.should.equal(surveyId);

          // Survey should not have users property
          // It's OK for survey to contain a property that's been set to
          // undefined. We shouldn't really be iterating over the own,
          // enumerable properties of a survey. And JSON.stringify will produce
          // the same output as if we had used delete on the property.
          should.equal(survey.users, undefined);

          // Try with a non-logged-in user
          Survey.findIfOwnedByUser(surveyId, 'nobody', function(error, survey) {
            error.code.should.equal(403);
            done();
          });
        });
      });
      //});
    });
  });

  suite('POST', function () {
    var url = BASEURL + '/surveys';

    var surveyId;

    test('Posting JSON to /surveys', function (done) {
      request.post({
        url: url,
        jar: userAJar,
        json: data_two
      }, function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(201);

        var i;
        for (i = 0; i < data_two.surveys.length; i += 1) {
          // Save the survey id for later tests
          surveyId = body.surveys[i]._id;

          assert.equal(data_two.surveys[i].name, body.surveys[i].name, 'Response differs from posted data');
          assert.equal(data_two.surveys[i].location, body.surveys[i].location, 'Response differs from posted data');
          assert.equal(data_two.surveys[i].timezone, body.surveys[i].timezone, 'Response differs from posted data');
          assert.equal(data_two.surveys[i].type, body.surveys[i].type);
          assert.equal(data_two.surveys[i].responseLongevity, body.surveys[i].responseLongevity);
          assert.deepEqual(data_two.surveys[i].surveyOptions, body.surveys[i].surveyOptions);

          assert.deepEqual(data_two.surveys[i].geoObjectSource, body.surveys[i].geoObjectSource);
          if(data_two.surveys[i].geoObjectSource) {
            assert.equal(data_two.surveys[i].geoObjectSource.type, body.surveys[i].geoObjectSource.type);
          }

          assert.notEqual(data_two.surveys[i].errantStuff, body.surveys[i].errantStuff);

          body.surveys[i].should.have.property('created');

          assert.notEqual(body.surveys[i].id, null, 'Response does not have an ID.');

          body.surveys[i].should.have.property('users');
          assert.equal(userA._id, body.surveys[i].users[0], 'Wrong or no user stored');

          // Security tests
          assert.equal(1, body.surveys[i].users.length, 'There should be only one user assigned, even though the POST had two');
          assert.notEqual(userB._id, body.surveys[i].users[0], 'Wrong user stored');

          // Slug tests
          body.surveys[i].should.have.property('slug');
          body.surveys[i].slug.should.be.type('string');
        }

        done();
      });
    });

    test('Posting bad survey JSON', function (done) {
      request.post({
        url: url,
        jar: userAJar,
        json: data_bad
      }, function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(400);

        done();
      });
    });

    test('Posting a survey with funny characters', function (done) {
      request.post({
        url: url,
        jar: userAJar,
        json: data_slug
      }, function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(201);
        body.surveys.length.should.equal(1);
        var survey = body.surveys[0];
        survey.should.have.property('slug');
        survey.slug.should.be.type('string');

        // Test for unacceptable characters
        /[~`!@#$%\^&*()+;:'",<>\/?\\{}\[\]|]/.test(survey.slug).should.equal(false);

        done();
      });
    });

  });

  suite('GET', function () {
    var id;
    var surveyTwo;
    var dataTwenty;

    setup(function (done) {
      // Create a survey.
      request.post({
        url: BASEURL + '/surveys',
        jar: userAJar,
        json: data_two
      }, function(error, response, body) {
        if (error) { done(error); }
        id = body.surveys[0].id;
        surveyTwo = body.surveys[1];

        // Create some entries for the survey.
        dataTwenty = fixtures.makeResponses(20);
        request.post({url: BASEURL + '/surveys/' + id + '/responses', json: dataTwenty},
                     function (error, response, body) {
          if (error) { done(error); }

          done();
        });
      });
    });

    test('Getting all surveys for this user', function (done) {
      request.get({
        url: BASEURL + '/surveys',
        jar: userAJar
      }, function (error, response, body) {
        assert.ifError(error);
        assert.equal(response.statusCode, 200, 'Status should be 200. Status is ' + response.statusCode);

        var parsed = JSON.parse(body);

        assert.notEqual(parsed.surveys, null, 'Parsed response body should contain a property called "surveys".');
        assert.ok(util.isArray(parsed.surveys), 'Response should contain an array');
        var i;
        for (i = 0; i < parsed.surveys.length; i += 1) {
          assert.notEqual(parsed.surveys[i].id, null, 'Returned surveys should have IDs.');
          parsed.surveys[i].should.have.property('slug');
          parsed.surveys[i].slug.should.be.type('string');
        }

        done();
      });
    });

    test('Other user should not see surveys', function (done) {
      request.get({
        url: BASEURL + '/surveys',
        jar: userBJar
      }, function (error, response, body) {
        assert.ifError(error);
        assert.equal(response.statusCode, 200, 'Status should be 200. Status is ' + response.statusCode);

        var parsed = JSON.parse(body);

        assert.notEqual(parsed.surveys, null, 'Parsed response body should contain a property called "surveys".');
        assert.ok(util.isArray(parsed.surveys), 'Response should contain an array');
        parsed.surveys.length.should.equal(0);


        done();
      });
    });


    test('Logged out users should get a 401', function (done) {
      request.get({
        url: BASEURL + '/surveys',
        jar: false
      }, function (error, response, body) {
        assert.ifError(error);
        assert.equal(response.statusCode, 401, 'Status should be 401. Status is ' + response.statusCode);

        done();
      });
    });


    test('Get a survey that does not exist', function (done) {
      request.get({
        url: BASEURL + '/surveys/doesnotexist',
        jar: false
      }, function (error, response, body) {
        assert.ifError(error);
        assert.equal(response.statusCode, 404, 'Status should be 404. Status is ' + response.statusCode);

        done();
      });
    });


    test('Getting a survey with no responses', function (done) {
      request.get({
        url: BASEURL + '/surveys/' + surveyTwo.id,
        jar: false
      }, function (error, response, body) {
        assert.ifError(error);
        assert.equal(response.statusCode, 200, 'Status should be 200. Status is ' + response.statusCode);
        response.headers.should.not.have.property('set-cookie');

        var parsed = JSON.parse(body);

        assert.ok(parsed.survey, 'Parsed response body should have a property called "survey".');

        assert.equal(parsed.survey.id, surveyTwo.id, 'The returned survey should match the requested ID.');
        assert.equal(data_two.surveys[1].name, parsed.survey.name, 'Response differs from posted data');

        parsed.survey.should.have.property('responseCount');
        parsed.survey.responseCount.should.be.Number;
        parsed.survey.responseCount.should.equal(0);

        parsed.survey.should.have.property('slug');
        parsed.survey.slug.should.be.type('string');

        done();
      });
    });


    test('Getting a survey with responses', function (done) {
      request.get({
        url: BASEURL + '/surveys/' + id,
        jar: false
      }, function (error, response, body) {
        assert.ifError(error);
        assert.equal(response.statusCode, 200, 'Status should be 200. Status is ' + response.statusCode);
        response.headers.should.not.have.property('set-cookie');

        var parsed = JSON.parse(body);

        assert.ok(parsed.survey, 'Parsed response body should have a property called "survey".');

        assert.equal(parsed.survey.id, id, 'The returned survey should match the requested ID.');
        assert.equal(data_two.surveys[0].name, parsed.survey.name, 'Response differs from posted data');

        parsed.survey.should.have.property('responseCount');
        parsed.survey.responseCount.should.be.Number;
        parsed.survey.responseCount.should.equal(20);

        parsed.survey.should.have.property('slug');
        parsed.survey.slug.should.be.type('string');

        // calculate bounds manually on the input data.
        var bounds = [
          [dataTwenty.responses[0].geo_info.centroid[0], dataTwenty.responses[0].geo_info.centroid[1]],
          [dataTwenty.responses[0].geo_info.centroid[0], dataTwenty.responses[0].geo_info.centroid[1]]
        ];
        dataTwenty.responses.forEach(function (item) {
          bounds[0][0] = Math.min(item.geo_info.centroid[0], bounds[0][0]);
          bounds[0][1] = Math.min(item.geo_info.centroid[1], bounds[0][1]);
          bounds[1][0] = Math.max(item.geo_info.centroid[0], bounds[1][0]);
          bounds[1][1] = Math.max(item.geo_info.centroid[1], bounds[1][1]);
        });
        parsed.survey.should.have.property('responseBounds');
        parsed.survey.responseBounds[0][0].should.equal(bounds[0][0]);
        parsed.survey.responseBounds[0][1].should.equal(bounds[0][1]);
        parsed.survey.responseBounds[1][0].should.equal(bounds[1][0]);
        parsed.survey.responseBounds[1][1].should.equal(bounds[1][1]);

        done();
      });
    });


    test('Getting stats for a survey', function (done) {
      async.waterfall([
        function (next) {
          // First, clear the responses for this survey.
          fixtures.clearResponses(id, next);
        },
        function (next) {
          // Then, add some responses.
          var responses = fixtures.makeResponses(5);
          var url = BASEURL + '/surveys/' + id + '/responses';

          // Set the object_id of a response so we can keep an eye on it
          responses.responses[0].object_id = 'myhouse';
          responses.responses[0].responses['new-stat'] = 'yes';

          request.post({url: url, json: responses}, function (error, response, body) {
            should.not.exist(error);
            response.statusCode.should.equal(201);
            next(error);
          });
        }
      ], function () {
        // Ok, now we can calculate the stats.
        var url = BASEURL + '/surveys/' + id + '/stats';
        request.get({
          url: url,
          jar: false
        }, function (error, response, body) {
          should.not.exist(error);
          response.statusCode.should.equal(200);
          response.headers.should.not.have.property('set-cookie');

          response = JSON.parse(body);

          should.exist(response.stats);
          should.exist(response.stats.Collectors);
          response.stats.Collectors.Name.should.equal(5);
          response.stats.site['parking-lot'].should.equal(5);
          response.stats['condition-1']['no response'].should.be.above(0);
          response.stats['new-stat'].yes.should.equal(1);

          done();
        });
      });

    }); // end getting stats

    test('Getting stats for a survey within a bounding box', function (done) {
      async.waterfall([
        function (next) {
          // First, clear the responses for this survey.
          fixtures.clearResponses(id, next);
        },
        function (next) {
          // Then, add some responses.
          var responses = fixtures.makeResponses(5);
          var url = BASEURL + '/surveys/' + id + '/responses';

          request.post({url: url, json: responses}, function (error, response, body) {
            should.not.exist(error);
            response.statusCode.should.equal(201);
            next(error);
          });
        }
      ], function () {
        var polygon = {
          type: "Polygon",
          coordinates: [[
            [-122.55523681640625,37.67077737288316],
            [-122.55523681640625,37.83690319650768],
            [-122.32040405273438,37.83690319650768],
            [-122.32040405273438,37.67077737288316],
            [-122.55523681640625,37.67077737288316]
          ]]
        };
        var polygonString = encodeURIComponent(JSON.stringify(polygon));

        var url = BASEURL + '/surveys/' + id + '/stats?intersects=' + polygonString;

        request.get({
          url: url,
          jar: false
        }, function (error, response, body) {
          should.not.exist(error);
          response.statusCode.should.equal(200);
          response.headers.should.not.have.property('set-cookie');

          response = JSON.parse(body);

          should.exist(response.stats);
          should.exist(response.stats.Collectors);
          response.stats.Collectors.Name.should.equal(5);
          response.stats.site['parking-lot'].should.equal(5);
          response.stats['condition-1']['no response'].should.be.above(0);

          done();
        });
      });

    }); // end getting stats


    test('Getting stats within a time frame', function (done) {
      var firstDate;
      var secondDate;

      async.waterfall([
        // First, clear the responses for this survey.
        function (next) {
          fixtures.clearResponses(id, next);
        },

        // Then, add some responses.
        function (next) {
          var responses = fixtures.makeResponses(2);
          var url = BASEURL + '/surveys/' + id + '/responses';

          request.post({url: url, json: responses}, function (error, response, body) {
            should.not.exist(error);
            response.statusCode.should.equal(201);
            setTimeout(function(){
              next(error);
            }, 200);
          });
        },

        function(next) {
          var responses = fixtures.makeResponses(1);
          var url = BASEURL + '/surveys/' + id + '/responses';

          request.post({url: url, json: responses}, function (error, response, body) {
            should.not.exist(error);
            response.statusCode.should.equal(201);
            firstDate = new Date(body.responses[0].created);
            setTimeout(function(){
              next(error);
            }, 200);
          });
        },

        function(next) {
          var responses = fixtures.makeResponses(3);
          var url = BASEURL + '/surveys/' + id + '/responses';

          request.post({url: url, json: responses}, function (error, response, body) {
            should.not.exist(error);
            response.statusCode.should.equal(201);
            setTimeout(function(){
              next(error);
            }, 200);
          });
        },

        function(next) {
          var responses = fixtures.makeResponses(1);
          var url = BASEURL + '/surveys/' + id + '/responses';

          request.post({url: url, json: responses}, function (error, response, body) {
            should.not.exist(error);
            response.statusCode.should.equal(201);
            secondDate = new Date(body.responses[0].created);
            setTimeout(function(){
              next(error);
            }, 200);
          });
        },

        // Add a couple last responses to bookend
        function(next) {
          var responses = fixtures.makeResponses(2);
          var url = BASEURL + '/surveys/' + id + '/responses';

          request.post({url: url, json: responses}, function (error, response, body) {
            should.not.exist(error);
            response.statusCode.should.equal(201);
            setTimeout(function(){
              next(error);
            }, 200);
          });
        },

        // Test responses before a time
        function(next) {
          var url = BASEURL + '/surveys/' + id + '/stats?until=' + firstDate.getTime();
          request.get({url: url}, function (error, response, body) {
            should.not.exist(error);
            response.statusCode.should.equal(200);

            response = JSON.parse(body);

            should.exist(response.stats);
            should.exist(response.stats.Collectors);
            response.stats.Collectors.Name.should.equal(3);
            response.stats.site['parking-lot'].should.equal(3);
            response.stats['condition-1']['no response'].should.be.above(0);

            next(error);
          });
        },

        // Test responses after a time
        function(next) {
          var url = BASEURL + '/surveys/' + id + '/stats?after=' + firstDate.getTime();
          request.get({url: url}, function (error, response, body) {
            should.not.exist(error);
            response.statusCode.should.equal(200);

            response = JSON.parse(body);

            should.exist(response.stats);
            should.exist(response.stats.Collectors);
            response.stats.Collectors.Name.should.equal(6);
            response.stats.site['parking-lot'].should.equal(6);

            next(error);
          });
        },

        // Test responses between a time
        function(next) {
          var url = BASEURL + '/surveys/' + id + '/stats?after=' + firstDate.getTime() + '&until=' + secondDate.getTime();
          request.get({url: url}, function (error, response, body) {
            should.not.exist(error);
            response.statusCode.should.equal(200);

            response = JSON.parse(body);

            should.exist(response.stats);
            should.exist(response.stats.Collectors);
            response.stats.Collectors.Name.should.equal(4);
            response.stats.site['parking-lot'].should.equal(4);

            next(error);
          });
        }

      ], function () {

        done();

      });

    }); // end getting stats


    test('Ensure stats for a bounding box are within the box', function (done) {
      async.waterfall([
        function (next) {
          // First, clear the responses for this survey.
          fixtures.clearResponses(id, next);
        },
        function (next) {
          // Then, add some responses.
          var responses = fixtures.makeResponses(5);
          var url = BASEURL + '/surveys/' + id + '/responses';

          request.post({url: url, json: responses}, function (error, response, body) {
            should.not.exist(error);
            response.statusCode.should.equal(201);
            next(error);
          });
        }
      ], function () {
        // somewhere in the Atlantic:
        var polygon = {
          type: "Polygon",
          coordinates: [[
            [-18,-13],
            [-18,-9],
            [-12,-9],
            [-12,-13],
            [-18,-13]
          ]]
        };
        var polygonString = encodeURIComponent(JSON.stringify(polygon));

        var url = BASEURL + '/surveys/' + id + '/stats?intersects=' + polygonString;

        request.get({
          url: url,
          jar: false
        }, function (error, response, body) {
          should.not.exist(error);
          response.statusCode.should.equal(200);
          response.headers.should.not.have.property('set-cookie');

          response = JSON.parse(body);
          should.exist(response.stats);
          should.exist(response.stats.Collectors);
          should.not.exist(response.stats.site);

          done();
        });
      });

    }); // end getting stats outside bbox

    test('stats for a nonexistant survey', function () {
      return request.getAsync({
        url: BASEURL + '/surveys/doesnotexist/stats',
        jar: false
      }).spread(function (response, body) {
        response.statusCode.should.equal(404);
      });
    });

  });

  suite('PUT: ', function () {
    var surveyId;

    test('PUT JSON to /survey/:id', function (done) {
      var url = BASEURL + '/surveys';

      request.post({
        url: url,
        jar: userAJar,
        json: data_two
      }, function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(201);

        var surveyToChange = body.surveys[0];
        surveyToChange.name = 'new name';

        url = BASEURL + '/surveys/' + surveyToChange.id;
        request.put({
          url: url,
          jar: userAJar,
          json: {'survey': surveyToChange}
        }, function (error, response, body) {
          should.not.exist(error);
          response.statusCode.should.equal(200);

          body.survey.name.should.equal('new name');
          done();
        });
      });
    });

    test('PUT JSON and ensure non-modified field remains', function (done) {
      var url = BASEURL + '/surveys';

      request.post({
        url: url,
        jar: userAJar,
        json: data_two
      }, function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(201);

        var surveyToChange = body.surveys[1];
        surveyToChange.name = 'new name';

        url = BASEURL + '/surveys/' + surveyToChange.id;
        request.put({
          url: url,
          jar: userAJar,
          json: {'survey': surveyToChange}
        }, function (error, response, body) {
          should.not.exist(error);
          response.statusCode.should.equal(200);

          body.survey.name.should.equal('new name');
          assert.deepEqual(data_two.surveys[1].surveyOptions, body.survey.surveyOptions);

          done();
        });
      });
    });

    test('PUT JSON to /surveys/:id from an unauthorized user', function (done) {
      var url = BASEURL + '/surveys';

      request.post({
        url: url,
        jar: userAJar,
        json: data_one
      }, function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(201);

        var surveyToChange = body.surveys[0];
        surveyToChange.name = 'new name';

        // Log in as a new user and try to change the survey
        url = BASEURL + '/surveys/' + surveyToChange.id;
        request.put({
          url: url,
          json: {'survey': surveyToChange},
          jar: userBJar
        }, function (error, response, body) {
          should.not.exist(error);
          response.statusCode.should.equal(403);

          done();
        });

      });
    });
  });

  suite('USERS: ', function () {
    var surveyId;

    test('Survey owners should be able to get full user info', function (done) {
      var url = BASEURL + '/surveys';

      request.post({
        url: url,
        jar: userAJar,
        json: data_two
      }, function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(201);

        var survey = body.surveys[0];

        url = BASEURL + '/surveys/' + survey.id + '/users';
        request.get({
          url: url,
          jar: userAJar
        }, function (error, response, body) {
          should.not.exist(error);
          response.statusCode.should.equal(200);

          var parsed = JSON.parse(body);
          parsed.users.length.should.equal(1);

          done();
        });
      });
    });

    test('Non-owners should not be able to get full user info', function (done) {
      var url = BASEURL + '/surveys';

      request.post({
        url: url,
        jar: userAJar,
        json: data_two
      }, function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(201);

        var survey = body.surveys[0];

        url = BASEURL + '/surveys/' + survey.id + '/users';
        request.get({
          url: url,
          jar: userBJar
        }, function (error, response, body) {
          should.not.exist(error);
          response.statusCode.should.equal(403);
          done();
        });
      });
    });
  });


  suite('SHARE: ', function () {
    var url = BASEURL + '/surveys';

    var surveyId;

    test('Share a survey with valid user email', function (done) {
      request.post({
        url: url,
        jar: userAJar,
        json: data_two
      }, function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(201);

        var surveyToChange = body.surveys[0];

        url = BASEURL + '/surveys/' + surveyToChange.id + '/users/user-b@localdata.com';
        request.put({
          url: url,
          jar: userAJar
        }, function (error, response, body) {
          should.not.exist(error);
          response.statusCode.should.equal(200);

          done();
        });
      });
    });

    test('Attempt to share without proper authorization', function (done) {
      var url = BASEURL + '/surveys';

      request.post({
        url: url,
        jar: userAJar,
        json: data_one
      }, function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(201);

        var surveyToChange = body.surveys[0];

        // Log in as a new user and try to change the survey
        url = BASEURL + '/surveys/' + surveyToChange.id + '/users/User B';
        request.put({
          url: url,
          jar: userBJar
        }, function (error, response, body) {
          should.not.exist(error);
          response.statusCode.should.equal(403);
          done();
        });

      });
    });

    test('Share with a user that does not exist', function (done) {
      var url = BASEURL + '/surveys';

      request.post({
        url: url,
        jar: userAJar,
        json: data_one
      }, function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(201);

        var surveyToChange = body.surveys[0];

        // Log in as a new user and try to change the survey
        url = BASEURL + '/surveys/' + surveyToChange.id + '/users/example@example.com';
        request.put({
          url: url,
          jar: userAJar
        }, function (error, response, body) {
          should.not.exist(error);
          response.statusCode.should.equal(400);

          // Make sure the message exists
          var parsed = JSON.parse(body);
          should.exist(parsed.name);
          should.exist(parsed.message);

          done();
        });

      });
    });

    test('Remove a user from a survey', function (done) {
      var url = BASEURL + '/surveys';

      request.post({
        url: url,
        jar: userAJar,
        json: data_one
      }, function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(201);

        var surveyToChange = body.surveys[0];
        surveyToChange.name = 'new name';

        // Log in as a new user and try to change the survey
        url = BASEURL + '/surveys/' + surveyToChange.id + '/users/user-a@localdata.com';
        request.del({
          url: url,
          jar: userAJar
        }, function (error, response, body) {
          should.not.exist(error);
          response.statusCode.should.equal(204);

          done();
        });

      });
    });

    test('Remove a user from a survey without the right permissions', function (done) {
      var url = BASEURL + '/surveys';

      request.post({
        url: url,
        jar: userAJar,
        json: data_one
      }, function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(201);

        var surveyToChange = body.surveys[0];
        surveyToChange.name = 'new name';

        // Log in as a new user and try to change the survey
        url = BASEURL + '/surveys/' + surveyToChange.id + '/users/user-a@localdata.com';
        request.del({
          url: url,
          jar: userBJar
        }, function (error, response, body) {
          should.not.exist(error);
          response.statusCode.should.equal(403);

          done();
        });

      });
    });

    test('Attempt to remove a user that does not exist', function (done) {
      var url = BASEURL + '/surveys';

      request.post({
        url: url,
        jar: userAJar,
        json: data_one
      }, function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(201);

        var surveyToChange = body.surveys[0];

        // Log in as a new user and try to change the survey
        url = BASEURL + '/surveys/' + surveyToChange.id + '/users/example@example.com';
        request.del({
          url: url,
          jar: userAJar
        }, function (error, response, body) {
          should.not.exist(error);
          response.statusCode.should.equal(400);

          // Make sure the message exists
          var parsed = JSON.parse(body);
          should.exist(parsed.name);
          should.exist(parsed.message);

          done();
        });

      });
    });


  });


  suite('DEL', function () {
    test('Authorized users should be able to delete a survey', function (done) {
      request.post({
        url: BASEURL + '/surveys',
        jar: userAJar,
        json: data_one
      }, function(error, response, body) {
        if (error) { done(error); }
        var id = body.surveys[0].id;
        request.del({
          url: BASEURL + '/surveys/' + id,
          jar: userAJar
        }, function (error, response, body) {
          assert.ifError(error);
          response.statusCode.should.equal(204);
          done();
        });
      });
    });

    test('Anonymous users should not be able to delete a survey', function (done) {
      request.post({
        url: BASEURL + '/surveys',
        jar: userAJar,
        json: data_one
      }, function(error, response, body) {
        if (error) { done(error); }
        var id = body.surveys[0].id;
        request.del({
          url: BASEURL + '/surveys/' + id
        }, function (error, response, body) {
          response.statusCode.should.equal(401);
          done();
        });
      });
    });

    test("Users who don't own a survey shouldn't be able to delete it", function (done) {
      request.post({
        url: BASEURL + '/surveys',
        jar: userAJar,
        json: data_one
      }, function(error, response, body) {
        if (error) { done(error); }
        var id = body.surveys[0].id;
        request.del({
          url: BASEURL + '/surveys/' + id,
          jar: userBJar
        }, function (error, response, body) {
          response.statusCode.should.equal(403);
          done();
        });
      });
    });
  });

});
