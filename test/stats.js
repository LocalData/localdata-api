/*jslint node: true, indent: 2, white: true, vars: true */
/*globals suite, test, setup, suiteSetup, suiteTeardown, teardown */
/*jshint -W030*/
'use strict';

var Promise = require('bluebird');
var request = require('request');
var should = require('should');

var server = require('./lib/router');
var fixtures = require('./data/fixtures');
var settings = require('../settings');


var BASEURL = 'http://localhost:' + settings.port + '/api';

Promise.promisifyAll(request);
Promise.promisifyAll(server);
Promise.promisifyAll(fixtures);

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


  suite('With time boundaries', function () {
    setup(function () {
      return Promise.bind(this)
      .then(function () {
        // Add some responses.
        var responses = fixtures.makeResponses(10);

        return request.postAsync({
          url: BASEURL + '/surveys/' + this.surveyId + '/responses',
          json: responses
        });
      }).spread(function (response, body) {
        this.firstDate = new Date(body.responses[3].created);
        this.secondDate = new Date(body.responses[8].created);
      });
    });

    test('before a time', function () {
      return request.getAsync({
        url: BASEURL + '/surveys/' + this.surveyId + '/stats?until=' + this.firstDate.getTime()
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
        url: BASEURL + '/surveys/' + this.surveyId + '/stats?after=' + this.firstDate.getTime()
      }).spread(function (response, body) {
        response.statusCode.should.equal(200);

        response = JSON.parse(body);

        should.exist(response.stats);
        should.exist(response.stats.Collectors);
        response.stats.Collectors.Name.should.equal(6);
        response.stats.site['parking-lot'].should.equal(6);
      });
    });

    test('between two times', function () {
      return request.getAsync({
        url: BASEURL + '/surveys/' + this.surveyId + '/stats?after=' + this.firstDate.getTime() + '&until=' + this.secondDate.getTime()
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

  test.skip('collector stats', function () {
  });

  test.skip('collector stats for a nonexistant survey', function () {
  });

  suite('Activity', function () {
    setup(function () {
      return Promise.resolve(fixtures.makeResponses(10).responses)
      .bind(this)
      .map(function (data) {
        return request.postAsync({
          url: BASEURL + '/surveys/' + this.surveyId + '/responses',
          json: { responses: [data] }
        });
      }).map(function (arr) {
        return arr[1];
      }).then(function (responses) {
        this.responses = responses;
      });
    });

    test('with no after parameter', function () {
      return request.getAsync({
        url: BASEURL + '/surveys/' + this.surveyId + '/stats/activity',
        qs: {
          until: Date.now(),
          resolution: 60000
        },
        jar: false
      }).bind(this).spread(function (response, body) {
        response.statusCode.should.equal(400);
        response.should.be.json;
        var data = JSON.parse(body);
        data.should.have.property('name');
        data.should.have.property('message');
      });
    });

    test('with no until parameter', function () {
      return request.getAsync({
        url: BASEURL + '/surveys/' + this.surveyId + '/stats/activity',
        qs: {
          after: Date.now() - 365 * 24 * 60 * 60 * 1000,
          resolution: 60000
        },
        jar: false
      }).bind(this).spread(function (response, body) {
        response.statusCode.should.equal(400);
        response.should.be.json;
        var data = JSON.parse(body);
        data.should.have.property('name');
        data.should.have.property('message');
      });
    });
    test.skip('with no resolution parameter', function () {
    });
    test.skip('with an invalid after parameter', function () {
    });
    test.skip('with an invalid until parameter', function () {
    });
    test.skip('with an invalid resolution parameter', function () {
    });

    test('with no after/until/resolution parameters', function () {
      return request.getAsync({
        url: BASEURL + '/surveys/' + this.surveyId + '/stats/activity',
        jar: false
      }).bind(this).spread(function (response, body) {
        response.statusCode.should.equal(200);
        var data = JSON.parse(body);
        data.should.have.property('stats');
        data.stats.should.have.property('total');
        data.stats.total.should.equal(10);
        // XXX check data against the created responses
      });
    });

    test.skip('with an intersects parameter', function () {
    });
    test.skip('with an invalid intersects parameter', function () {
    });

    test.skip('with too high a resolution for the time range', function () {
    });

    test.skip('with after larger than until', function () {
      // XXX this should successfully return no activity
    });

    test.skip('for a nonexistant survey', function () {
    });
  });

});
