/*jslint node: true, indent: 2, white: true, vars: true */
/*globals suite, test, setup, suiteSetup, suiteTeardown, done, teardown */
'use strict';

var server = require('../web.js');
var util = require('util');
var request = require('request');
var should = require('should');
var fs = require('fs');

var settings = require('../settings-test.js');

var BASEURL = 'http://localhost:' + settings.port + '/api';

suite('Forms', function () {
  var data_paper = { forms: [] };
  var data_all = { forms: [] };
  var surveyId = '123';

  suiteSetup(function (done) {
    fs.readFile('test/data/form_paper.json', function (err, raw) {
      if (err) { return done(err); }
      data_all.forms.push(JSON.parse(raw));
      data_paper.forms.push(JSON.parse(raw));
      fs.readFile('test/data/form_mobile.json', function (err, raw) {
        if (err) { return done(err); }
        data_all.forms.push(JSON.parse(raw));
        server.run(settings, done);
      });    
    });
  });

  suiteTeardown(function () {
    server.stop();
  });


  suite('GET', function () {
    var id; 
    
    setup(function (done) {
      request.post({url: BASEURL + '/surveys/' + surveyId + '/forms', json: data_paper},
                   function (error, response, body) {
        if (error) { return done(error); }
        console.log(body);
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
        for (i = 0; i < parsed.forms.length; i += 1) {
          parsed.forms[i].survey.should.equal(surveyId);
          if (parsed.forms[i].id === id) {
            index = i;
          }
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
      request.get({url: BASEURL + '/surveys/' + surveyId + '/parcels/' + parcelId + '/forms'},
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
        }
        // Make sure the form we just added is in this set.
        index.should.be.above(-1);

        done();
      });
    });
  });

  suite('POST', function () {
    test('Add form to survey', function (done) {
      request.post({url: BASEURL + '/surveys/' + surveyId + '/forms', json: data_all},
                   function (error, response, body) {
                     
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

  suite('DEL', function () {
    var id;
    setup(function (done) {
      request.post({url: BASEURL + '/surveys/' + surveyId + '/forms', json: data_paper},
                   function (error, response, body) {
        if (error) { return done(error); }
        id = body.forms[0].id;
        done();
      });
    });

    test('Delete a form by ID', function (done) {
      request.del({url: BASEURL + '/surveys/' + surveyId + '/forms/' + id},
                  function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(200);
        response.should.be.json;

        var parsed = JSON.parse(body);
        parsed.should.have.property('count');
        parsed.count.should.equal(1);

        done();
      });
    });

    test('Delete all forms for a survey', function (done) {
      request.del({url: BASEURL + '/surveys/' + surveyId + '/forms'},
                  function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(200);
        response.should.be.json;

        var parsed = JSON.parse(body);
        parsed.should.have.property('count');
        parsed.count.should.be.above(0);

        done();
      });
    });
  });

  suite('PUT', function () {
    var id;
    var form;
    setup(function (done) {
      request.post({url: BASEURL + '/surveys/' + surveyId + '/forms', json: data_paper},
                   function (error, response, body) {
        if (error) { return done(error); }
        id = body.forms[0].id;
        fs.readFile('test/data/form_mobile.json', function (err, raw) {
          if (err) { return done(err); }
          form = JSON.parse(raw);
          done();
        });    
      });
    });

    test('Modify a mobile form', function (done) {
      var date = new Date();
      form.questions[0].name = 'New Question Name';
      request.put({
        url: BASEURL + '/surveys/' + surveyId + '/forms/' + id,
        json: { form: form }
      }, function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(200);
        response.should.be.json;

        body.should.have.property('form');
        body.form.should.have.property('survey');
        body.form.survey.should.equal(surveyId);
        body.form.should.have.property('id');
        body.form.id.should.equal(id);

        body.form.should.have.property('type');
        body.form.type.should.equal(form.type);
        body.form.should.have.property('questions');
        body.form.questions.should.have.lengthOf(form.questions.length);
        body.form.questions[0].name.should.equal(form.questions[0].name);

        body.form.should.have.property('created');
        var created = new Date(body.form.created);
        created.getUTCFullYear().should.equal(date.getUTCFullYear());
        created.getUTCMonth().should.equal(date.getUTCMonth());
        created.getUTCDate().should.equal(date.getUTCDate());
        created.getUTCHours().should.equal(date.getUTCHours());

        done();
      });
    });

  });

});
