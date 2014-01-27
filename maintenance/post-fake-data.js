#!/usr/bin/env node
/*jslint node: true, indent: 2, white: true, vars: true */
'use strict';

/*
 * Posts fake entries for a survey. Useful for seeding a test or demo survey.
 *
 * Finds random parcels in the specified tile and adds random (but valid)
 * responses for those parcels.
 *
 * post-fake-data.js HOST SLUG TILENAME
 * post-fake-data.js demo.localdata.com my-cool-demo-site 15/5241/12665
 *
 */

var _ = require('lodash');
var async = require('async');
var request = require('request');

// The API host to which we'll post data.
var host = process.argv[2];
var base = 'http://' + host + '/api';

var slug = process.argv[3];
var tileName = process.argv[4];

var entryCount = 200;

var survey;

function getJSON(url, process, done) {
  request.get(url, function (error, response, body) {
    if (error) {
      done(error);
      return;
    }

    if (response.statusCode !== 200) {
      done({
        message: 'Got status ' + response.statusCode + ' for URL ' + url
      });
      return;
    }

    var data;
    try {
      data = JSON.parse(body);
    } catch (e) {
      done(e);
    }

    done(null, process(data));
  });
}

// done(error, surveyId)
function getSurveyId(slug, done) {
  getJSON(base + '/slugs/' + slug, function (data) {
    return data.survey;
  }, done);
}

function getSurvey(id, done) {
  getJSON(base + '/surveys/' + id, function (data) {
    console.log('Posting data to ' + data.survey.name);
    return data.survey;
  }, done);
}

function getForm(id, done) {
  getJSON(base + '/surveys/' + id + '/forms', function (data) {
    return data.forms[0];
  }, done);
}

function tile2long(x,z) {
  return (x/Math.pow(2,z)*360-180);
}

function tile2lat(y,z) {
  var n=Math.PI-2*Math.PI*y/Math.pow(2,z);
  return (180/Math.PI*Math.atan(0.5*(Math.exp(n)-Math.exp(-n))));
}

function tileToBBox(tile) {
  var sw = [tile2long(tile[1], tile[0]), tile2lat(tile[2] + 1, tile[0])];
  var ne = [tile2long(tile[1] + 1, tile[0]), tile2lat(tile[2], tile[0])];
  return [sw, ne];
}

// GET http://localhost:3000/api/parcels?bbox=-{SW_LON},{SW_LAT},{NE_LON},{NE_LAT}
function getParcels(tileName, done) {
  var tile = tileName.split('/').map(function (n) { return parseInt(n, 10); });
  var bbox = tileToBBox(tile);
  request.get({
    url: base + '/parcels.geojson',
    qs: { bbox: bbox.join(',') }
  }, function (error, response, body) {
    if (error) { return done(error); }
    var fc = JSON.parse(body);
    console.log('Got ' + fc.features.length + ' features in this tile');
    done(null, fc);
  });
}

function random(len) {
  return Math.floor(Math.random() * len);
}

function randomResponses(form) {
  var responses = {};

  function handleQuestion(question) {
    if (question.answers) {
      var pick = question.answers[random(question.answers.length)];
      responses[question.name] = pick.value;

      if (pick.questions) {
        pick.questions.forEach(handleQuestion);
      }
    }
  }

  form.questions.forEach(handleQuestion);
  return responses;
}

function makeResponse(feature, form) {
  var response = {
    source: {
      type: 'mobile',
      collector: 'Demo User'
    },
    geo_info: {
      geometry: feature.geometry,
      centroid: feature.properties.centroid.coordinates,
      humanReadableName: feature.properties.address,
      parcel_id: feature.id
    },
    parcel_id: feature.id,
    object_id: feature.id,
    responses: randomResponses(form)
  };
  return response;
}

function postEntry(entry, next) {
  request.post({
    url: base + '/surveys/' + survey.id + '/responses',
    json: {
      responses: [entry]
    }
  }, function (error, response, body) {
    if (error) { return next(error); }
    if (response.statusCode !== 201) {
      return next({
        message: 'Received status code ' + response.statusCode + ' when posting a response'
      });
    }
    next(null);
  });
}

async.series([
  // Get the survey
  _.bind(async.waterfall, async, [
    _.partial(getSurveyId, slug),
    getSurvey,
    function (data, next) {
      survey = data;
      getForm(survey.id, next);
    }
  ]),
  _.partial(getParcels, tileName)
], function (error, results) {
  var form = results[0];
  var parcelFC = results[1];

  var features = _.shuffle(parcelFC.features).slice(0, entryCount);

  async.eachSeries(features, function (feature, next) {
    var entry = makeResponse(feature, form);
    postEntry(entry, next);
  }, function (error) {
    if (error) {
      console.log(error);
      process.exit(1);
    }
    console.log('Created ' + entryCount + ' entries.');
  });
});
