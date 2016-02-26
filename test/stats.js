/*jslint node: true, indent: 2, white: true, vars: true */
/*globals suite, test, setup, suiteSetup, suiteTeardown */
/*jshint -W030*/
'use strict';

var assert = require('assert');

var _ = require('lodash');
var moment = require('moment');
var Promise = require('bluebird');
var request = require('request');
var should = require('should');

var server = require('./lib/router');
var fixtures = require('./data/fixtures');
var settings = require('../settings');

var Response = require('../lib/models/Response');


var BASEURL = 'http://localhost:' + settings.port + '/api';

Promise.promisifyAll(request);
Promise.promisifyAll(server);
Promise.promisifyAll(fixtures);
Promise.promisifyAll(Response);

suite('Stats', function () {

  var surveyData = {
    surveys : [ {
      name: 'Just a survey',
      location: 'Detroit',
      timezone: 'America/Detroit',
      type: 'parcel',
      users: ['A', 'B']
    } ]
  };

  suiteSetup(function () {
    return server.runAsync()
    .bind(this)
    .then(function () {
      return fixtures.clearSurveysAsync();
    }).then(function () {
      return fixtures.clearUsersAsync();
    }).then(function () {
      return fixtures.addUserAsync('User A');
    }).spread(function (jar, id, user) {
      this.userAJar = jar;
      this.userA = user;

      return fixtures.addUserAsync('User B');
    }).spread(function (jar, id, user) {
      this.userBJar = jar;
      this.userB = user;

      return request.postAsync({
        url: BASEURL + '/surveys',
        jar: this.userAJar,
        json: surveyData
      });
    }).spread(function (response, body) {
      this.surveyId = body.surveys[0].id;
    });
  });

  suiteTeardown(function () {
    return server.stopAsync();
  });

  suite('Overview', function () {
    setup(function () {
      // Clear the responses.
      return fixtures.clearResponsesAsync(this.surveyId);
    });

    test('Getting stats for a survey', function () {
      var responses = fixtures.makeResponses(5);
      var url = BASEURL + '/surveys/' + this.surveyId + '/responses';

      // Set the object_id of a response so we can keep an eye on it
      responses.responses[0].object_id = 'myhouse';
      responses.responses[0].responses['new-stat'] = 'yes';

      return Promise.bind(this)
      .then(function () {
        // Add some responses.
        return request.postAsync({
          url: url,
          json: responses
        });
      }).spread(function (response, body) {
        response.statusCode.should.equal(201);

        // Get the stats
        return request.getAsync({
          url: BASEURL + '/surveys/' + this.surveyId + '/stats',
          jar: false
        });
      }).spread(function (response, body) {
        response.statusCode.should.equal(200);
        response.headers.should.not.have.property('set-cookie');

        response = JSON.parse(body);

        should.exist(response.stats);
        should.exist(response.stats.Collectors);
        response.stats.Collectors.Name.should.equal(5);
        response.stats.site['parking-lot'].should.equal(5);
        response.stats['condition-1']['no response'].should.be.above(0);
        response.stats['new-stat'].yes.should.equal(1);
      });
    }); // end getting stats

    test('Getting cached stats for a survey', function () {
      var responses = fixtures.makeResponses(5);
      var url = BASEURL + '/surveys/' + this.surveyId + '/responses';

      return Promise.bind(this)
      .then(function () {
        // Add some responses.
        return request.postAsync({
          url: url,
          json: responses
        });
      }).spread(function (response, body) {
        response.statusCode.should.equal(201);

        // Get the stats
        return request.getAsync({
          url: BASEURL + '/surveys/' + this.surveyId + '/stats',
          jar: false
        });
      }).spread(function (response, body) {
        response.statusCode.should.equal(200);

        response = JSON.parse(body);
        this.stats1 = response.stats;

        // Get the stats again
        return request.getAsync({
          url: BASEURL + '/surveys/' + this.surveyId + '/stats',
          jar: false
        });
      }).spread(function (response, body) {
        response.statusCode.should.equal(200);

        response = JSON.parse(body);
        this.stats2 = response.stats;

        assert.deepEqual(this.stats2, this.stats1);
      });
    }); // end getting cached stats

    test('Getting fresh stats after an addition', function () {
      var responses = fixtures.makeResponses(5);
      var url = BASEURL + '/surveys/' + this.surveyId + '/responses';

      return Promise.bind(this)
      .then(function () {
        // Add some responses.
        return request.postAsync({
          url: url,
          json: responses
        });
      }).spread(function (response, body) {
        response.statusCode.should.equal(201);

        // Get the stats
        return request.getAsync({
          url: BASEURL + '/surveys/' + this.surveyId + '/stats',
          jar: false
        });
      }).spread(function (response, body) {
        response.statusCode.should.equal(200);

        response = JSON.parse(body);
        this.stats1 = response.stats;

        var newResponses = fixtures.makeResponses(2, {
          parcelBase: 4444
        });
        // Add some more responses.
        return request.postAsync({
          url: url,
          json: newResponses
        });
      }).spread(function (response, body) {
        response.statusCode.should.equal(201);

        // Get the stats again
        return request.getAsync({
          url: BASEURL + '/surveys/' + this.surveyId + '/stats',
          jar: false
        });
      }).spread(function (response, body) {
        response.statusCode.should.equal(200);

        response = JSON.parse(body);
        this.stats2 = response.stats;

        assert.notDeepEqual(this.stats2, this.stats1);
      });
    });

    test('Getting fresh stats after a deletion', function () {
      var responses = fixtures.makeResponses(5);
      var url = BASEURL + '/surveys/' + this.surveyId + '/responses';

      return Promise.bind(this)
      .then(function () {
        // Add some responses.
        return request.postAsync({
          url: url,
          json: responses
        });
      }).spread(function (response, body) {
        response.statusCode.should.equal(201);

        this.responseId = body.responses[0].id;

        // Get the stats
        return request.getAsync({
          url: BASEURL + '/surveys/' + this.surveyId + '/stats',
          jar: false
        });
      }).spread(function (response, body) {
        response.statusCode.should.equal(200);

        response = JSON.parse(body);
        this.stats1 = response.stats;

        // Delete a response
        return request.delAsync({
          url: BASEURL +
               '/surveys/' + this.surveyId +
               '/responses/' + this.responseId,
          jar: this.userAJar,
        });
      }).spread(function (response, body) {
        response.statusCode.should.equal(204);

        // Get the stats again
        return request.getAsync({
          url: BASEURL + '/surveys/' + this.surveyId + '/stats',
          jar: false
        });
      }).spread(function (response, body) {
        response.statusCode.should.equal(200);

        response = JSON.parse(body);
        this.stats2 = response.stats;

        assert.notDeepEqual(this.stats2, this.stats1);
      });
    });

    test('Getting stats for a survey within a bounding box', function () {
      var responses = fixtures.makeResponses(5);

      return Promise.bind(this)
      .then(function () {
        // Add some responses.
        return request.postAsync({
          url: BASEURL + '/surveys/' + this.surveyId + '/responses',
          json: responses
        });
      }).spread(function (response, body) {
        response.statusCode.should.equal(201);

        var polygon = {
          type: 'Polygon',
          coordinates: [[
            [-122.55523681640625,37.67077737288316],
            [-122.55523681640625,37.83690319650768],
            [-122.32040405273438,37.83690319650768],
            [-122.32040405273438,37.67077737288316],
            [-122.55523681640625,37.67077737288316]
          ]]
        };
        var polygonString = encodeURIComponent(JSON.stringify(polygon));

        return request.getAsync({
          url: BASEURL + '/surveys/' + this.surveyId + '/stats?intersects=' + polygonString,
          jar: false
        });
      }).spread(function (response, body) {
        response.statusCode.should.equal(200);
        response.headers.should.not.have.property('set-cookie');

        response = JSON.parse(body);

        should.exist(response.stats);
        should.exist(response.stats.Collectors);
        response.stats.Collectors.Name.should.equal(5);
        response.stats.site['parking-lot'].should.equal(5);
        response.stats['condition-1']['no response'].should.be.above(0);
      });
    }); // end getting stats

    test('Getting cached stats for a survey within a bounding box', function () {
      var polygon = {
        type: 'Polygon',
        coordinates: [[
          [-122.55523681640625,37.67077737288316],
          [-122.55523681640625,37.83690319650768],
          [-122.32040405273438,37.83690319650768],
          [-122.32040405273438,37.67077737288316],
          [-122.55523681640625,37.67077737288316]
        ]]
      };
      var polygonString = encodeURIComponent(JSON.stringify(polygon));
      var responses = fixtures.makeResponses(5);
      var url = BASEURL + '/surveys/' + this.surveyId + '/responses';

      return Promise.bind(this)
      .then(function () {
        // Add some responses.
        return request.postAsync({
          url: url,
          json: responses
        });
      }).spread(function (response, body) {
        response.statusCode.should.equal(201);

        // Get the stats
        return request.getAsync({
          url: BASEURL + '/surveys/' + this.surveyId + '/stats?intersects=' + polygonString,
          jar: false
        });
      }).spread(function (response, body) {
        response.statusCode.should.equal(200);

        response = JSON.parse(body);
        this.stats1 = response.stats;

        // Get the stats again
        return request.getAsync({
          url: BASEURL + '/surveys/' + this.surveyId + '/stats?intersects=' + polygonString,
          jar: false
        });
      }).spread(function (response, body) {
        response.statusCode.should.equal(200);

        response = JSON.parse(body);
        this.stats2 = response.stats;

        assert.deepEqual(this.stats2, this.stats1);
      });
    });

    suite('With time boundaries', function () {
      var firstDate;
      var secondDate;

      setup(function () {
        return Promise.bind(this)
        .then(function () {
          // Add four fake responses
          var responses = fixtures.makeResponses(4);

          return request.postAsync({
            url: BASEURL + '/surveys/' + this.surveyId + '/responses',
            json: responses
          });
        }).spread(function (response, body) {
          // Get the date of the last of those first responses.
          // That will be our baseline start date.
          firstDate = new Date(body.responses[3].created);

          // Now, create four more responses
          var responses = fixtures.makeResponses(5);
          return request.postAsync({
            url: BASEURL + '/surveys/' + this.surveyId + '/responses',
            json: responses
          });
        }.bind(this)).spread(function (response, body) {
          // Get the last date of those four.
          // That will be our baseline end date
          secondDate = new Date(body.responses[4].created);

          // Add a couple more responses after the baseline range
          var responses = fixtures.makeResponses(6);
          return request.postAsync({
            url: BASEURL + '/surveys/' + this.surveyId + '/responses',
            json: responses
          });
        }.bind(this));
      });

      test('before a time', function () {
        return request.getAsync({
          url: BASEURL + '/surveys/' + this.surveyId + '/stats?until=' + firstDate.getTime()
        }).spread(function (response, body) {
          response.statusCode.should.equal(200);

          response = JSON.parse(body);

          should.exist(response.stats);
          should.exist(response.stats.Collectors);
          response.stats.Collectors.Name.should.equal(4);
          response.stats.site['parking-lot'].should.equal(4);
          response.stats['condition-1']['no response'].should.be.above(0);
        });
      });

      test('after a time', function () {
        return request.getAsync({
          url: BASEURL + '/surveys/' + this.surveyId + '/stats?after=' + firstDate.getTime()
        }).spread(function (response, body) {
          response.statusCode.should.equal(200);

          response = JSON.parse(body);

          should.exist(response.stats);
          should.exist(response.stats.Collectors);
          response.stats.Collectors.Name.should.equal(11);
          response.stats.site['parking-lot'].should.equal(11);
        });
      });

      test('between two times', function () {
        return request.getAsync({
          url: BASEURL + '/surveys/' + this.surveyId + '/stats?after=' + firstDate.getTime() + '&until=' + secondDate.getTime()
        }).spread(function (response, body) {
          response.statusCode.should.equal(200);

          response = JSON.parse(body);

          should.exist(response.stats);
          should.exist(response.stats.Collectors);
          response.stats.Collectors.Name.should.equal(5);
          response.stats.site['parking-lot'].should.equal(5);
        });
      });
    }); // time boundaries suite

    suite('With a collector filter', function () {
      setup(function () {
        return Promise.bind(this)
        .then(function () {
          // Add some responses.
          var responses = fixtures.makeResponses(10);

          this.testName = "Name to select for";
          responses.responses[0].source.collector = this.testName;
          responses.responses[1].source.collector = this.testName;

          return request.postAsync({
            url: BASEURL + '/surveys/' + this.surveyId + '/responses',
            json: responses
          });
        });
      });

      test('for a specific collector', function () {
        return request.getAsync({
          url: BASEURL + '/surveys/' + this.surveyId + '/stats?collector=' + this.testName
        }).spread(function (response, body) {
          response.statusCode.should.equal(200);

          response = JSON.parse(body);

          should.exist(response.stats);
          response.stats.site['parking-lot'].should.equal(2);
        });
      });

    }); // collector suite

    test('Ensure stats for a bounding box are within the box', function () {
      return Promise.bind(this)
      .then(function () {
        // Add some responses.
        var responses = fixtures.makeResponses(5);
        return request.postAsync({
          url: BASEURL + '/surveys/' + this.surveyId + '/responses',
          json: responses
        });
      }).spread(function (response, body) {
        response.statusCode.should.equal(201);

        // somewhere in the Atlantic:
        var polygon = {
          type: 'Polygon',
          coordinates: [[
            [-18,-13],
            [-18,-9],
            [-12,-9],
            [-12,-13],
            [-18,-13]
          ]]
        };
        var polygonString = encodeURIComponent(JSON.stringify(polygon));

        return request.getAsync({
          url: BASEURL + '/surveys/' + this.surveyId + '/stats?intersects=' + polygonString,
          jar: false
        });
      }).spread(function (response, body) {
        response.statusCode.should.equal(200);
        response.headers.should.not.have.property('set-cookie');

        response = JSON.parse(body);
        should.exist(response.stats);
        should.exist(response.stats.Collectors);
        should.not.exist(response.stats.site);
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

  suite('Activity', function () {
    suiteSetup(function () {
      function makeEntry(date, oddeven) {
        return {
          source: {
            type: 'mobile',
            collector: oddeven + ' person',
            started: date,
            finished: date
          },
          created: date,
          files: [],
          responses: {
            baseline: 'A',
            evenodd: oddeven
          }
        };
      }

      this.entryCount = 0;
      this.oddCount = 0;

      var responses = [];
      var i;
      var entries;
      var date;
      var geometry;

      var now = Date.now();
      // 5 days ago.
      var baseTime = now - 5 * 24 * 60 * 60 * 1000;
      var step = Math.floor((now - baseTime) / 200);

      for (i = 0; i < 200; i += 1) {
        date = new Date(baseTime + i * step);
        if (i === 0) {
          // One response gets 2 entries.
          entries = [makeEntry(new Date(baseTime - 60 * 1000), 'even'), makeEntry(date, 'even')];
        } else if (i % 2 === 0) {
          entries = [makeEntry(date, 'even')];
        } else {
          entries = [makeEntry(date, 'odd')];
          this.oddCount += 1;
        }

        this.entryCount += entries.length;

        if (i % 2 === 0) {
          geometry = {
            type: 'MultiPolygon',
            coordinates: [ [ [
              [-122.43469523018862, 37.771087088400655],
              [-122.43477071284453, 37.77146083403105],
              [-122.4346853083731, 37.77147170307505],
              [-122.43460982859321, 37.771097964560134],
              [-122.43463544873167, 37.77109470163426],
              [-122.43469523018862, 37.771087088400655]
            ] ] ]
          };
        } else {
          geometry = {
            type: 'MultiPolygon',
            coordinates: [ [ [
              [-52.43469523018862, 37.771087088400655],
              [-52.43477071284453, 37.77146083403105],
              [-52.4346853083731, 37.77147170307505],
              [-52.43460982859321, 37.771097964560134],
              [-52.43463544873167, 37.77109470163426],
              [-52.43469523018862, 37.771087088400655]
            ] ] ]
          };
        }

        responses[i] = {
          properties: {
            survey: this.surveyId,
            humanReadableName: 'Someplace' + i,
            object_id: 'A12345-' + i,
            info: {},
            centroid: [-122.43469027023522, 37.77127939798119]
          },
          entries: entries,
          geometry: geometry
        };
      }

      // Clear the responses.
      return fixtures.clearResponsesAsync(this.surveyId)
      .bind(this)
      .then(function () {
        return responses;
      }).map(function (response) {
        return Response.createAsync(response);
      }, {
        concurrency: 100
      }).then(function (responses) {
        this.responses = responses;
      });
    });

    // The ones that should work.

    test('with no after/until/resolution parameters', function () {
      var now = Date.now();
      var start = now - 24 * 60 * 60 * 1000;
      // 6-minute resolution
      var resolution = 6 * 60 * 1000;

      return request.getAsync({
        url: BASEURL + '/surveys/' + this.surveyId + '/stats/activity',
        jar: false
      }).bind(this).spread(function (response, body) {
        response.statusCode.should.equal(200);

        var data = JSON.parse(body);
        data.should.have.property('stats');
        data.stats.should.have.property('total');
        data.stats.should.have.property('resolution');
        data.stats.should.have.property('activity');

        data.stats.resolution.should.equal(resolution);

        // 24 hours of data at 6-minute resolution (but we return sparse data)
        data.stats.activity.length.should.below((now - start) / resolution + 1);

        var entries = _(this.responses).map('entries').flatten();
        var trueCount = entries.filter(function (entry) {
          return entry.created > start;
        }).value().length;
        data.stats.total.should.equal(trueCount);

        // Verify the activity breakdown
        _(data.stats.activity).forEach(function (item) {
          var start = item.ts;
          var end = item.ts + resolution;
          var trueCount = entries.filter(function (entry) {
            return entry.created > start && entry.created <= end;
          }).value().length;
          item.count.should.equal(trueCount);
        });

        // Verify sort order
        data.stats.activity.should.eql(_.sortBy(data.stats.activity, 'ts'), 'Activity should be sorted');
      });
    });

    test('with an intersects parameter', function () {
      var west = -130;
      var east = -120;
      var south = 35;
      var north = 40;

      var boundary = {
        type: 'Polygon',
        coordinates: [ [
          [west, south],
          [west, north],
          [east, north],
          [east, south],
          [west, south]
        ] ]
      };

      var now = Date.now();
      var start = now - 24 * 60 * 60 * 1000;
      // 6-minute resolution
      var resolution = 6 * 60 * 1000;

      return request.getAsync({
        url: BASEURL + '/surveys/' + this.surveyId + '/stats/activity',
        jar: false,
        qs: {
          intersects: JSON.stringify(boundary)
        }
      }).bind(this).spread(function (response, body) {
        response.statusCode.should.equal(200);

        var data = JSON.parse(body);
        data.should.have.property('stats');
        data.stats.should.have.property('total');
        data.stats.should.have.property('resolution');
        data.stats.should.have.property('activity');

        data.stats.resolution.should.equal(resolution);

        var entries = _(this.responses).filter(function (r) {
          var point = r.geometry.coordinates[0][0][0];
          return (point[0] > west &&
                  point[0] < east &&
                  point[1] > south &&
                  point[1] < north);
        }).map('entries')
        .flatten()
        .filter(function (entry) {
          return entry.created > start && entry.created <= now;
        });

        var trueCount = entries.value().length;
        data.stats.total.should.equal(trueCount);

        _(data.stats.activity).reduce(function (memo, item) {
          return memo + item.count;
        }, 0).should.equal(data.stats.total);

        // Verify the activity breakdown
        _(data.stats.activity).forEach(function (item) {
          var start = item.ts;
          var end = item.ts + resolution;
          var trueCount = entries.filter(function (entry) {
            return entry.created > start && entry.created <= end;
          }).value().length;
          item.count.should.equal(trueCount);
        });

        // Verify sort order
        data.stats.activity.should.eql(_.sortBy(data.stats.activity, 'ts'), 'Activity should be sorted');
      });
    });

    test('with a valid time range and resolution', function () {
      // 6-minute resolution
      var resolution = 6 * 60 * 1000;
      var now = Date.now();
      var start = now - 12 * 60 * 60 * 1000;
      return request.getAsync({
        url: BASEURL + '/surveys/' + this.surveyId + '/stats/activity',
        jar: false,
        qs: {
          after: start,
          until: now,
          resolution: resolution
        }
      }).bind(this).spread(function (response, body) {
        response.statusCode.should.equal(200);

        var data = JSON.parse(body);
        data.should.have.property('stats');
        data.stats.should.have.property('total');
        data.stats.should.have.property('resolution');
        data.stats.should.have.property('activity');

        data.stats.resolution.should.equal(resolution);

        // 24 hours of data at 6-minute resolution (but we return sparse data)
        data.stats.activity.length.should.below((now - start) / resolution + 1);

        var entries = _(this.responses).map('entries').flatten();
        var trueCount = entries.filter(function (entry) {
          return entry.created > start;
        }).value().length;
        data.stats.total.should.equal(trueCount);

        // Verify the activity breakdown
        _(data.stats.activity).forEach(function (item) {
          var start = item.ts;
          var end = item.ts + resolution;
          var trueCount = entries.filter(function (entry) {
            return entry.created > start && entry.created <= end;
          }).value().length;
          item.count.should.equal(trueCount);
        });

        // Verify sort order
        data.stats.activity.should.eql(_.sortBy(data.stats.activity, 'ts'), 'Activity should be sorted');
      });
    });

    test('for a specific collector', function () {
      var now = Date.now();
      var start = now - 24 * 60 * 60 * 1000;
      // 6-minute resolution
      var resolution = 6 * 60 * 1000;
      var name = 'Odd person';

      return request.getAsync({
        url: BASEURL + '/surveys/' + this.surveyId + '/stats/activity',
        jar: false,
        qs: {
          collector: name
        }
      }).bind(this).spread(function (response, body) {
        response.statusCode.should.equal(200);

        var data = JSON.parse(body);
        data.should.have.property('stats');
        data.stats.should.have.property('total');
        data.stats.should.have.property('resolution');
        data.stats.should.have.property('activity');

        data.stats.resolution.should.equal(resolution);

        var entries = _(this.responses)
        .map('entries')
        .flatten()
        .filter(function (entry) {
          return (entry.created > start &&
                  entry.created <= now &&
                  entry.source.collector.toLowerCase() === name.toLowerCase());
        });

        var trueCount = entries.value().length;
        data.stats.total.should.equal(trueCount);

        _(data.stats.activity).reduce(function (memo, item) {
          return memo + item.count;
        }, 0).should.equal(data.stats.total);

        // Verify the activity breakdown
        _(data.stats.activity).forEach(function (item) {
          var start = item.ts;
          var end = item.ts + resolution;
          var trueCount = entries.filter(function (entry) {
            return entry.created > start && entry.created <= end;
          }).value().length;
          item.count.should.equal(trueCount);
        });

        // Verify sort order
        data.stats.activity.should.eql(_.sortBy(data.stats.activity, 'ts'), 'Activity should be sorted');
      });
    });

    // The ones that shouldn't work.

    function verifyClientError(response, body) {
      response.statusCode.should.equal(400);
      response.should.be.json;
      var data = JSON.parse(body);
      data.should.have.property('name');
      data.should.have.property('message');
    }

    test('with no after parameter', function () {
      return request.getAsync({
        url: BASEURL + '/surveys/' + this.surveyId + '/stats/activity',
        qs: {
          until: Date.now(),
          resolution: 60000
        },
        jar: false
      }).spread(verifyClientError);
    });

    test('with no until parameter', function () {
      return request.getAsync({
        url: BASEURL + '/surveys/' + this.surveyId + '/stats/activity',
        qs: {
          after: Date.now() - 60 * 60 * 1000,
          resolution: 60000
        },
        jar: false
      }).spread(verifyClientError);
    });

    test('with no resolution parameter', function () {
      return request.getAsync({
        url: BASEURL + '/surveys/' + this.surveyId + '/stats/activity',
        qs: {
          after: Date.now() - 60 * 60 * 1000,
          until: Date.now()
        },
        jar: false
      }).spread(verifyClientError);
    });

    test('with an invalid after parameter', function () {
      return request.getAsync({
        url: BASEURL + '/surveys/' + this.surveyId + '/stats/activity',
        qs: {
          after: Date(),
          until: Date.now(),
          resolution: 60000
        },
        jar: false
      }).spread(verifyClientError);
    });

    test('with an invalid until parameter', function () {
      return request.getAsync({
        url: BASEURL + '/surveys/' + this.surveyId + '/stats/activity',
        qs: {
          after: Date.now() - 60 * 60 * 1000,
          until: Date(),
          resolution: 60000
        },
        jar: false
      }).spread(verifyClientError);
    });

    test('with an invalid resolution parameter', function () {
      return request.getAsync({
        url: BASEURL + '/surveys/' + this.surveyId + '/stats/activity',
        qs: {
          after: Date.now() - 365 * 24 * 60 * 60 * 1000,
          until: Date.now(),
          resolution: 'hour'
        },
        jar: false
      }).spread(verifyClientError);
    });

    test('with an invalid intersects parameter', function () {
      return request.getAsync({
        url: BASEURL + '/surveys/' + this.surveyId + '/stats/activity',
        qs: {
          intersects: '-42,80,-40,85'
        },
        jar: false
      }).spread(verifyClientError);
    });

    test('with too high a resolution for the time range', function () {
      return request.getAsync({
        url: BASEURL + '/surveys/' + this.surveyId + '/stats/activity',
        qs: {
          after: Date.now() - 24 * 60 * 60 * 1000, // 24 hours ago
          until: Date.now(),
          resolution: 60 * 1000 // 1 minute
        },
        jar: false
      }).spread(verifyClientError);
    });

    test('with after larger than until', function () {
      return request.getAsync({
        url: BASEURL + '/surveys/' + this.surveyId + '/stats/activity',
        qs: {
          after: Date.now(),
          until: Date.now() - 60 * 60 * 1000,
          resolution: 60 * 60 * 1000 // 1 hour
        },
        jar: false
      }).spread(function (response, body) {
        response.statusCode.should.equal(200);
        var data = JSON.parse(body);
        data.should.have.property('stats');
        data.stats.should.have.property('total');
        data.stats.total.should.equal(0);
        data.stats.activity.should.have.length(0);
      });
    });

    test('for a nonexistant survey', function () {
      return request.getAsync({
        url: BASEURL + '/surveys/DOES-NOT-EXIST/stats/activity',
        jar: false
      }).spread(function (response, body) {
        response.statusCode.should.equal(404);
      });
    });
  });


  suite('Activity', function () {
    suiteSetup(function () {
      function makeEntry(date, oddeven) {
        return {
          source: {
            type: 'mobile',
            collector: oddeven + ' person',
            started: date,
            finished: date
          },
          created: date,
          files: [],
          responses: {
            baseline: 'A',
            evenodd: oddeven
          }
        };
      }

      this.entryCount = 0;
      this.oddCount = 0;

      var responses = [];
      var i;
      var entries;
      var date;
      var geometry;

      var now = Date.now();
      var baseTime = now - 100 * 24 * 60 * 60 * 1000; // 100 days ago.
      var step = Math.floor((now - baseTime) / 200); // Distribute them evenly
                                                     // over 200 days

      for (i = 0; i < 200; i += 1) {
        date = new Date(baseTime + i * step);
        if (i === 0) {
          // One response gets 2 entries.
          entries = [makeEntry(new Date(baseTime - 60 * 1000), 'even'), makeEntry(date, 'even')];
        } else if (i % 2 === 0) {
          entries = [makeEntry(date, 'even')];
        } else {
          entries = [makeEntry(date, 'odd')];
          this.oddCount += 1;
        }

        this.entryCount += entries.length;

        if (i % 2 === 0) {
          geometry = {
            type: 'MultiPolygon',
            coordinates: [ [ [
              [-122.43469523018862, 37.771087088400655],
              [-122.43477071284453, 37.77146083403105],
              [-122.4346853083731, 37.77147170307505],
              [-122.43460982859321, 37.771097964560134],
              [-122.43463544873167, 37.77109470163426],
              [-122.43469523018862, 37.771087088400655]
            ] ] ]
          };
        } else {
          geometry = {
            type: 'MultiPolygon',
            coordinates: [ [ [
              [-52.43469523018862, 37.771087088400655],
              [-52.43477071284453, 37.77146083403105],
              [-52.4346853083731, 37.77147170307505],
              [-52.43460982859321, 37.771097964560134],
              [-52.43463544873167, 37.77109470163426],
              [-52.43469523018862, 37.771087088400655]
            ] ] ]
          };
        }

        responses[i] = {
          properties: {
            survey: this.surveyId,
            humanReadableName: 'Someplace' + i,
            object_id: 'A12345-' + i,
            info: {},
            centroid: [-122.43469027023522, 37.77127939798119]
          },
          entries: entries,
          geometry: geometry
        };
      }

      // Clear the responses.
      return fixtures.clearResponsesAsync(this.surveyId)
      .bind(this)
      .then(function () {
        return responses;
      }).map(function (response) {
        return Response.createAsync(response);
      }, {
        concurrency: 100
      }).then(function (responses) {
        this.responses = responses;
      });
    });

    // The ones that should work.

    test('monthly range queries', function () {
      var now = Date.now();
      var start = now - 24 * 60 * 60 * 1000;
      // 6-minute resolution
      var resolution = 6 * 60 * 1000;

      return request.getAsync({
        url: BASEURL + '/surveys/' + this.surveyId + '/stats/activity/monthly',
        jar: false
      }).bind(this).spread(function (response, body) {
        response.statusCode.should.equal(200);

        var data = JSON.parse(body);
        data.should.have.property('stats');
        data.stats.should.have.property('total');
        data.stats.should.have.property('activity');

        var entries = _(this.responses).map('entries').flatten();
        var trueCount = entries.size();
        data.stats.total.should.equal(trueCount);

        // Verify the activity breakdown
        _(data.stats.activity).forEach(function (item) {
          var year = item.date.year;
          var month = item.date.month;

          var trueCount = entries.filter(function (entry) {
            var m = moment(entry.created);
            var trueMonth = m.format('MM');
            var trueYear = m.format('YYYY');
            return year === trueYear && month === trueMonth;
          }).value().length;

          item.count.should.equal(trueCount);
        });

        // Verify sort order
        data.stats.activity.should.eql(_.sortBy(data.stats.activity, 'ts'), 'Activity should be sorted');
      });
    });

    test('monthly range queries filtered by question', function () {
      var now = Date.now();
      var start = now - 24 * 60 * 60 * 1000;
      // 6-minute resolution
      var resolution = 6 * 60 * 1000;

      return request.getAsync({
        url: BASEURL + '/surveys/' + this.surveyId + '/stats/activity/monthly?responses[evenodd]=even',
        jar: false
      }).bind(this).spread(function (response, body) {
        response.statusCode.should.equal(200);

        var data = JSON.parse(body);
        data.should.have.property('stats');
        data.stats.should.have.property('total');
        data.stats.should.have.property('activity');

        var entries = _(this.responses).map('entries').flatten();
        entries = entries.where({ responses: { 'evenodd': 'even'}});
        var trueCount = entries.size();
        data.stats.total.should.equal(trueCount);

        // Verify the activity breakdown
        _(data.stats.activity).forEach(function (item) {
          var year = item.date.year;
          var month = item.date.month;

          var trueCount = entries.filter(function (entry) {
            var m = moment(entry.created);
            var trueMonth = m.format('MM');
            var trueYear = m.format('YYYY');
            return year === trueYear && month === trueMonth;
          }).value().length;

          item.count.should.equal(trueCount);
        });

        // Verify sort order
        data.stats.activity.should.eql(_.sortBy(data.stats.activity, 'ts'), 'Activity should be sorted');
      });
    });
    test('for a nonexistant survey', function () {
      return request.getAsync({
        url: BASEURL + '/surveys/DOES-NOT-EXIST/stats/activity/monthly',
        jar: false
      }).spread(function (response, body) {
        response.statusCode.should.equal(404);
      });
    });

  });
});
