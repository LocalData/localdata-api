/*jslint node: true, indent: 2, white: true, vars: true */
/*globals suite, test, setup, suiteSetup, suiteTeardown, done, teardown */
'use strict';

var server = require('../web.js');
var assert = require('assert');
var fs = require('fs');
var _ = require('lodash');
var request = require('request');
var should = require('should');
var util = require('util');

var settings = require('../settings.js');

/**
 * Insert a number of fake responses
 * Usage: `node fakedata.js count surveyId`
 *    eg: `node fakedata.js 100 my-survey-id-here`
 */

var BASEURL = 'http://localhost:' + settings.port + '/api';
var surveyId;

var computeRingCentroid = function(ring) {
  var off = ring[0];
  var twiceArea = 0;
  var x = 0;
  var y = 0;
  var nPoints = ring.length;
  var p1, p2;
  var f;

  var i, j;
  for (i = 0, j = nPoints - 1; i < nPoints; j = i, i += 1) {
    p1 = ring[i];
    p2 = ring[j];
    f = (p1[1] - off[1]) * (p2[0] - off[0]) - (p2[1] - off[1]) * (p1[0] - off[0]);
    twiceArea += f;
    y += (p1[1] + p2[1] - 2 * off[1]) * f;
    x += (p1[0] + p2[0] - 2 * off[0]) * f;
  }
  f = twiceArea * 3;
  return [x / f + off[0], y / f + off[1]];
};

// Compute the centroid of a geometry.
var computeCentroid = function(geometry) {
  if (geometry.type === 'MultiPolygon') {
    // TODO: For now we only handle the first polygon.
    return computeRingCentroid(geometry.coordinates[0][0]);
  }

  if (geometry.type === 'Polygon') {
    // TODO: For now we only handle the exterior ring.
    return computeRingCentroid(geometry.coordinates[0]);
  }

  if (geometry.type === 'Point') {
    return _.clone(geometry.coordinates);
  }

  return null;
};

var names = ['Alicia', 'Prashant', 'Matt', 'Jen', 'Abhi', 'Alex'];
var conditions = ['good', 'fair', 'poor', 'demolish'];
var use = ['residential', 'commercial', 'park', 'church'];

/**
 * Generate a response object given a geojson object 
 * @param  {Object} geo 
 * @return {Object}     A response object
 */
var generator = function(feature) {
  var r6 = Math.floor(Math.random() * 6);
  var r4 = Math.floor(Math.random() * 4);
  var rbool = !Math.floor(Math.random() * 2);
  var dateInRange = function() {
    var now = new Date();
    var minutes = Math.floor(Math.random() * 1000);
    var date = new Date(now.getTime() + (minutes * 60 * 1000));
    console.log(date);
    return date;
  };

  var response = {
    'source': {
      'type': 'random',
      'collector': names[r6]
    },
    geo_info: {
      centroid: computeCentroid(feature.geometry),
      geometry: feature.geometry
    },
    parcel_id: feature.properties.MAPBLKLOT,
    survey: surveyId,
    created: dateInRange(),
    responses: {
      'condition': conditions[r4],
      'use': use[r4],
      'demolish': 'yes'
    }
  };

  // Randomly don't mark demolish
  if(rbool) {
    delete response.demolish;
  }

  return response;
};


var responses = [];
var build = function(number, survey) {
  surveyId = survey;

  console.log("Opening huge geojson data file");
  fs.readFile('test/data/sf.geojson', function(err, data) {
    if(err) {
      console.log("Error opening the file:", err);
    }

    console.log("Parsing geojson features");
    var features = JSON.parse(data).features;
    console.log("Done getting geojson features");

    // Only save after we have all the features
    var saveAll = _.after(number, save);

    _.times(number, function(index) {
      console.log("Generating ", index);
      responses.push(generator(features[index]));

      save(saveAll);
    });

  });
};

var save = function() {
  console.log(responses);
  console.log(responses[0].geo_info.centroid);
  console.log(responses[0].geo_info.geometry);
};

var times = parseInt(process.argv[2], 10);
surveyId = process.argv[3];

console.log("Preparing to add", times, "responses to ", surveyId);
build(times, surveyId);


