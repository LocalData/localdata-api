/*jslint node: true, indent: 2, white: true, vars: true */
/*globals suite, test, setup, suiteSetup, suiteTeardown, done, teardown */
'use strict';

var fs = require('fs');
var _ = require('lodash');
var mongoose = require('mongoose');
var should = require('should');
var util = require('util');
var uuid = require('node-uuid');
var async = require('async');

var Response = require('../lib/models/Response.js');

var settings = require('../settings.js');

/**
 * Insert a number of fake responses
 * Why insert directly into the DB instead of posting to /surveyId/responses? 
 * This way we can fake more things, like the submission timestamp. 
 *
 * Requires a base data file (DATA_PATH) that specifies a geojson file
 * This script expects that you're using a copy of the SF parce shapefile
 * reprojected to EPSG:4326 and saved as GeoJSON.
 * 
 * Usage: `node fakedata.js number surveyId`
 *    eg: `node fakedata.js 100 my-survey-id-here`
 *
 * To clear all results for a survey:
 *        `node fakedata.js clear surveyId`
 */

var idgen = uuid.v1; // ID generator
var DATA_PATH = 'test/data/sf.geojson';

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
var generator = function(feature, survey) {
  var r6 = Math.floor(Math.random() * 6);
  var r4 = Math.floor(Math.random() * 4);
  var rbool = !Math.floor(Math.random() * 2);
  var rbool2 = !Math.floor(Math.random() * 2);

  var dateInRange = function() {
    var now = new Date();
    var minutes = Math.floor(Math.random() * 2880); // distribute over ~2 days
    var date = new Date(now.getTime() + (minutes * 60 * 1000));
    return date;
  };

  var response = {
    'source': {
      'type': 'random',
      'collector': names[r6]
    },
    geo_info: {
      centroid: computeCentroid(feature.geometry),
      geometry: feature.geometry,
      humanReadableName: feature.properties.FROM_ST + ' ' + feature.properties.STREET
    },
    object_id: feature.properties.MAPBLKLOT,
    survey: survey,
    created: dateInRange(),
    responses: {
      'structure': rbool ? 'yes' : 'no',
      'condition': conditions[r4],
      'use': use[r4],
      'improvements': 'yes',
      'dumping': 'yes'
    }
  };

  // Randomly don't mark demolish
  if(rbool) {
    delete response.responses.improvements;
  }

  if(rbool2) {
    delete response.responses.dumping;
  }

  return response;
};

/**
 * Generate the responses
 * @param  {Int}    number Number of responses to create
 * @param  {String} survey ID of the survey
 */
function build(number, survey, done) {
  console.log("Opening geojson data file");
  fs.readFile(DATA_PATH, function(err, data) {
    if(err) {
      console.log("Error opening the file:", err);
      return;
    }

    console.log("Loading lots of geojson features");
    var features = JSON.parse(data).features;
    console.log('Done loading ' + features.length + ' geojson features');

    var parallelLimit = 20;

    var count = 0;
    function printProgress(next, error) {
      count += 1;
      if (count === parallelLimit) {
        process.stdout.write('.');
        count = 0;
      }
      next(error);
    }

    async.eachLimit(_.first(features, number), parallelLimit, function (feature, next) {
      Response.create(generator(feature, survey), _.partial(printProgress, next));
    }, function (error) {
      process.stdout.write('\n');
      done(error);
    });

  });
}



/**
 * Clear all the results from a given survey
 * @param  {Object} db       Mongo db connection
 * @param  {String} surveyId 
 */
function clear(surveyId, done) {
  console.log("Getting ready to clear responses");
  Response.remove({ survey: surveyId }, function (error) {
    console.log('Done clearing the survey responses');
    done(error);
  });
}

// Get the surveyId
var surveyId = process.argv[3];

var opts = {
  db: {
    w: 1,
    safe: true,
    native_parser: settings.mongo_native_parser
  }
};

if (settings.mongo_user !== undefined) {
  opts.user = settings.mongo_user;
  opts.pass = settings.mongo_password;
}

mongoose.connect(settings.mongo_host, settings.mongo_db, settings.mongo_port, opts);

var db = mongoose.connection;

db.on('error', function (error) {
  console.log('Error connecting to mongo server.');
  console.log(error);
  throw error;
});

db.once('open', function () {
  if(process.argv[2] === 'clear') {
    console.log("You asked me to clear the responses... here goes");
    clear(surveyId, function (error) {
      if (error) {
        console.log(error);
      }
      db.close();
    });
  }

  var times = parseInt(process.argv[2], 10);
  if(!isNaN(times)) {
    build(times, surveyId, function (error) {
      if (error) { console.log(error); }
      db.close();
    });
  }
});

