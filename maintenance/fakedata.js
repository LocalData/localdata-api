/*jslint node: true, indent: 2, white: true, vars: true */
/*globals suite, test, setup, suiteSetup, suiteTeardown, done, teardown */
'use strict';

var server = require('../web.js');
var assert = require('assert');
var fs = require('fs');
var util = require('util');
var request = require('request');
var should = require('should');

var settings = require('../settings.js');

var BASEURL = 'http://localhost:' + settings.port + '/api';

var data_one = {
  "responses": [
    {
      "source": {
        "type": "mobile",
        "collector": "Name"
      },
      "geo_info": {
        "centroid": [
          42.331136749929435,
          -83.06584382779543
        ],
        "parcel_id": "06000402."
      },
      "parcel_id": "06000402.",
      "responses": {
        "parcel_id": "06000402.",
        "use-count": "1",
        "collector": "Some Name",
        "site": "parking-lot",
        "condition-1": "demolish"
      }
    }
  ]
};

var names = ['Alicia', 'Prashant', 'Matt', 'Jen', 'Abhi', 'Alex'];
var conditions = ['good', 'fair', 'poor', 'demolish'];
var use = ['residential', 'commercial', 'park', 'church'];

var generator = function(geo) {
  var r6 = Math.floor(Math.random() * 6);
  var r4 = Math.floor(Math.random() * 4);
  var rbool = !Math.floor(Math.random() * 2);

  var response = {
    'source': {
      'type': 'mobile',
      'collector': names[r6]
    },
    geo_info: {},
    parcel_id: geo.parcelId,
    responses: {
      'condition': conditions[r4],
      'use': use[r4],
      'demolish': 'yes'
    }      
  };

  if(rbool) {
    delete response.demolish;
  }

  return response;
};


var responses = [];
var surveyId;
var build = function(survey, number) {
  surveyId = survey;

  fs.readFile('test/data/sf.geojson', function(err, data) {
    var features = JSON.parse(data).features;

    var saveAll = _.after(number, save);
    _.times(number, function(index) {

      responses.push(generator(features[index]));
      
      save(saveAll);
    });

  });
};

var save = function() {
  var url = BASEURL + '/surveys/' + surveyId + '/responses';
  request.post({url: url, json: {'responses': responses}}, function (error, response, body) {
    console.log("Saved? ", error, response);
  });
};


