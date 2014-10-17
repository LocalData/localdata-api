/*jslint node: true, indent: 2, white: true, vars: true */
/*globals suite, test, setup, suiteSetup, suiteTeardown, done, teardown */
'use strict';

var async = require('async');
var fs = require('fs');
var request = require('request');
var should = require('should');
var util = require('util');

var fixtures = require('./data/fixtures');
var server = require('./lib/router');
var settings = require('../settings.js');

var BASEURL = 'http://localhost:' + settings.port + '/api';

suite('Forms', function () {
  var data_paper = { forms: [] };
  var data_all = { forms: [] };
  var surveyId = '123';
  var userA;
  var userB;
  var userAJar;
  var userBJar;

  suiteSetup(function (done) {

    async.series([
      function (next) {
        fs.readFile('test/data/form_paper.json', function (err, raw) {
          if (err) { return done(err); }
          data_all.forms.push(JSON.parse(raw));
          data_paper.forms.push(JSON.parse(raw));
          fs.readFile('test/data/form_mobile.json', function (err, raw) {
            if (err) { return done(err); }
            data_all.forms.push(JSON.parse(raw));
            server.run(next);
          });
        });
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
      },
      function (next) {
        // Create a survey.
        request.post({
          url: BASEURL + '/surveys',
          jar: userAJar,
          json: fixtures.surveys
        }, function(error, response, body) {
          surveyId = body.surveys[0].id;
          next();
        });
      }
    ], done);
  });

  suiteTeardown(function () {
    server.stop();
  });

  suite('GET', function () {
    var id;

    setup(function (done) {
      request.post({
        url: BASEURL + '/surveys/' + surveyId + '/forms',
        json: data_paper,
        jar: userAJar
      }, function (error, response, body) {
        if (error) { return done(error); }
        id = body.forms[0].id;
        done();
      });
    });

    test('Get all forms for a survey', function (done) {
      request.get({url: BASEURL + '/surveys/' + surveyId + '/forms'},
                  function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(200);
        response.should.be.json;

        var parsed = JSON.parse(body);
        parsed.should.have.property('forms');
        parsed.forms.length.should.be.above(0);
        var i;
        var index = -1;
        var prevTime = Number.MAX_VALUE;
        var created;
        for (i = 0; i < parsed.forms.length; i += 1) {
          parsed.forms[i].survey.should.equal(surveyId);
          if (parsed.forms[i].id === id) {
            index = i;
          }
          created = Date.parse(parsed.forms[i].created);
          created.should.be.below(prevTime);
          prevTime = created;
        }
        // Make sure the form we added is in this set.
        index.should.be.above(-1);

        done();
      });
    });

    test('Get a form by ID', function (done) {
      request.get({url: BASEURL + '/surveys/' + surveyId + '/forms/' + id},
                  function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(200);
        response.should.be.json;

        var parsed = JSON.parse(body);
        parsed.should.have.property('form');
        parsed.form.should.have.property('survey').equal(surveyId);
        parsed.form.should.have.property('id').equal(id);
        should.deepEqual(parsed.form.parcels, data_paper.forms[0].parcels);
        parsed.form.type.should.equal(data_paper.forms[0].type);

        done();
      });
    });

    test('Get forms by parcel ID', function (done) {
      var parcelId = '03001529.';
      request.get({url: BASEURL + '/surveys/' + surveyId + '/forms?parcel=' + parcelId},
                  function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(200);
        response.should.be.json;

        var parsed = JSON.parse(body);
        parsed.should.have.property('forms');
        parsed.forms.length.should.be.above(0);
        var i;
        var index = -1;
        var j;
        var parcelIndex;
        var prevTime = Number.MAX_VALUE;
        var created;
        for (i = 0; i < parsed.forms.length; i += 1) {
          parsed.forms[i].survey.should.equal(surveyId);
          if (parsed.forms[i].id === id) {
            index = i;
          }
          parcelIndex = -1;

          // Make sure each form returned references the requested parcel ID.
          for (j = 0; j < parsed.forms[i].parcels.length; j += 1) {
            if (parsed.forms[i].parcels[j].parcel_id === parcelId) {
              parcelIndex = j;
            }
          }
          parcelIndex.should.be.above(-1);

          created = Date.parse(parsed.forms[i].created);
          created.should.be.below(prevTime);
          prevTime = created;
        }
        // Make sure the form we just added is in this set.
        index.should.be.above(-1);

        done();
      });
    });
  });

  suite('POST', function () {

    test('Add form to survey', function (done) {
      request.post({
        url: BASEURL + '/surveys/' + surveyId + '/forms',
        json: data_all,
        jar: userAJar
      }, function (error, response, body) {

        // Basic sanity checks
        should.not.exist(error);
        response.statusCode.should.equal(201);
        response.should.be.json;

        // These apply to all form requests
        body.should.have.property('forms');
        body.forms.should.have.lengthOf(data_all.forms.length);

        var i;
        for (i = 0; i < body.forms.length; i += 1) {
          body.forms[i].should.have.property('survey').equal(surveyId);
          body.forms[i].should.have.property('id');
          body.forms[i].should.have.property('created');
          body.forms[i].should.have.property('type');

          // Test paper and mobile forms separately
          if(body.forms[i].type === "paper"){
            should.deepEqual(body.forms[i].parcels, data_all.forms[i].parcels);
            should.deepEqual(body.forms[i].global, data_all.forms[i].global);
            body.forms[i].type.should.equal(data_paper.forms[i].type);
          }else {
            // Mobile form tests
            should.deepEqual(body.forms[i].questions, data_all.forms[i].questions);
            body.forms[i].type.should.equal(data_all.forms[i].type);
          }
        }

        done();
      });
    });
  });

  // suite('DEL', function () {
  //   var id;
  //   setup(function (done) {
  //     request.post({url: BASEURL + '/surveys/' + surveyId + '/forms', json: data_paper},
  //                  function (error, response, body) {
  //       if (error) { return done(error); }
  //       id = body.forms[0].id;
  //       done();
  //     });
  //   });

  //   test('Delete a form by ID', function (done) {
  //     request.del({url: BASEURL + '/surveys/' + surveyId + '/forms/' + id},
  //                 function (error, response, body) {
  //       should.not.exist(error);
  //       response.statusCode.should.equal(200);
  //       response.should.be.json;

  //       var parsed = JSON.parse(body);
  //       parsed.should.have.property('count');
  //       parsed.count.should.equal(1);

  //       done();
  //     });
  //   });

  //   test('Delete all forms for a survey', function (done) {
  //     request.del({url: BASEURL + '/surveys/' + surveyId + '/forms'},
  //                 function (error, response, body) {
  //       should.not.exist(error);
  //       response.statusCode.should.equal(200);
  //       response.should.be.json;

  //       var parsed = JSON.parse(body);
  //       parsed.should.have.property('count');
  //       parsed.count.should.be.above(0);

  //       done();
  //     });
  //   });
  // });

  suite('PUT', function () {
    var id;
    var form;
    setup(function (done) {
      request.post({
        url: BASEURL + '/surveys/' + surveyId + '/forms',
        json: data_paper,
        jar: userAJar
      }, function (error, response, body) {
        if (error) { return done(error); }
        id = body.forms[0].id;
        fs.readFile('test/data/form_mobile.json', function (err, raw) {
          if (err) { return done(err); }
          form = JSON.parse(raw);
          done();
        });
      });
    });

  });

});
