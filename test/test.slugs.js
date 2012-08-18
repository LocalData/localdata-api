/*jslint node: true */
/*globals suite, test, setup, suiteSetup, suiteTeardown, done, teardown */
'use strict';

var server = require('../web.js');
var util = require('util');
var request = require('request');
var should = require('should');
var fs = require('fs');

var settings = require('../settings-test.js');

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

  var id;
  var slug;

  setup(function (done) {
    request.post({url: BASEURL + '/surveys', json: data_one}, function(error, response, body) {
      if (error) { done(error); }
      id = body.surveys[0].id;
      slug = body.surveys[0].slug;
      done();
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
    request.post({url: BASEURL + '/surveys', json: data_one}, function(error, response, body) {
      should.not.exist(error);
      response.statusCode.should.equal(201);
      response.should.be.json;

      slug.should.not.equal(body.surveys[0].slug);

      done();
    });
  });
});
