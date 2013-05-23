/*jslint node: true */
/*globals suite, test, setup, suiteSetup, suiteTeardown, done, teardown */
'use strict';

var server = require('../lib/server.js');
var util = require('util');

var mongo = require('mongodb');
var request = require('request');
var should = require('should');
var util = require('util');

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

  var userA = {
    'name': 'User A',
    'email': 'a@localdata.com',
    'password': 'password'
  };

  /**
   * Remove all results from a collection
   * @param  {String}   collection Name of the collection
   * @param  {Function} done       Callback, accepts error, response
   */
  var clearCollection = function(collectionName, done) {
    var db = new mongo.Db(settings.mongo_db, new mongo.Server(settings.mongo_host,
                                                          settings.mongo_port,
                                                          {}), { w: 1, safe: true });

    db.open(function() {
      db.collection(collectionName, function(error, collection) {
        if(error) {
          console.log("BIG ERROR");
          console.log(error);
          assert(false);
          done(error);
        }

        // Remove all the things!
        collection.remove({}, function(error, response){
          done(error, response);
        });
      });

    });
  };

  setup(function (done) {
    var url = BASEURL + '/user';
    clearCollection('usersCollection', function(error, response){
      request.post({url: url, json: userA}, function (error, response, body) {
        request.post({url: BASEURL + '/surveys', json: data_one}, function(error, response, body) {
          if (error) { done(error); }
          console.log(body);
          id = body.surveys[0].id;
          slug = body.surveys[0].slug;
          done();
        });
      });
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
