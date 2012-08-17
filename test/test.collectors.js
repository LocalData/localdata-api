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

// TODO: We haven't actually spec'd out the collectors API, so this just tests
// the basic functionality of the HTTP methods.
suite('Collectors', function () {
  var data_two = {
    collectors: [{}, {}]
  };
  var data_mod = {
    collector: { forms: ['abc0', 'abc1', 'abc2'] }
  };
  var surveyId = '123';

  suiteSetup(function (done) {
    server.run(settings, done);
  });

  suiteTeardown(function () {
    server.stop();
  });

  suite('GET', function () {
    var id;

    setup(function (done) {
      request.post({
        url: BASEURL + '/surveys/' + surveyId + '/collectors',
        json: data_two
      }, function (error, response, body) {
        if (error) { return done(error); }
        id = body.collectors[0].id;
        done();
      });
    });

    test('Get a collector', function (done) {
      request({
        url: BASEURL + '/surveys/' + surveyId + '/collectors/' + id
      }, function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(200);
        response.should.be.json;

        var parsed = JSON.parse(body);
        parsed.should.have.property('collector');
        parsed.collector.should.have.property('id');
        parsed.collector.id.should.equal(id);
        parsed.collector.should.have.property('survey');
        parsed.collector.survey.should.equal(surveyId);

        done();
      });
    });
  });

  suite('POST', function () {
    test('Add a collector for a survey', function (done) {
      request.post({
        url: BASEURL + '/surveys/' + surveyId + '/collectors',
        json: data_two
      }, function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(201);
        response.should.be.json;

        body.should.have.property('collectors');
        body.collectors.should.have.lengthOf(data_two.collectors.length);
        var i;
        for (i = 0; i < body.collectors.length; i += 1) {
          body.collectors[i].should.have.property('id');
          body.collectors[i].should.have.property('survey');
          body.collectors[i].survey.should.equal(surveyId);
        }

        done();
      });
    });
  });

  suite('PUT', function () {
    var id;

    setup(function (done) {
      request.post({
        url: BASEURL + '/surveys/' + surveyId + '/collectors',
        json: data_two
      }, function (error, response, body) {
        if (error) { return done(error); }
        id = body.collectors[0].id;
        done();
      });
    });

    test('Add forms to a collector', function (done) {
      request.put({
        url: BASEURL + '/surveys/' + surveyId + '/collectors/' + id,
        json: data_mod
      }, function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(200);
        response.should.be.json;

        body.should.have.property('collector');
        body.collector.should.have.property('id');
        body.collector.id.should.equal(id);
        body.collector.should.have.property('survey');
        body.collector.survey.should.equal(surveyId);

        body.collector.should.have.property('forms');
        var i;
        for (i = 0; i < body.collector.forms.length; i += 1) {
          body.collector.forms[i].should.equal(data_mod.collector.forms[i]);
        }

        done();
      });
    });
  });
});
