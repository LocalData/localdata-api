/*jslint node: true */

/*
 * Find all of the responses (in the old responseCollection and structure) that
 * correspond to the same base feature as some other response.
 *
 * Usage:
 *   $ envrun -e my-deployment.env node find-plural-entries.js
 *
 * Or run on Heroku to mitigate network latency.
 */
'use strict';

var async = require('async');

var mongo = require('../lib/mongo');

var db;

function getSurveys(done) {
  db.collection('surveyCollection').find({}).toArray(function (error, docs) {
    if (error) { return done(error); }
    done(null, docs);
  });
}

function checkSurvey(survey, done) {
  var surveyId = survey.id;
  db.collection('responseCollection').mapReduce(function map() {
    emit({
      object_id: this.object_id || this.parcel_id
    }, {
      object_id: this.object_id || this.parcel_id,
      name: this.geo_info ? this.geo_info.humanReadableName : 'unknown',
      count: 1
    });
  }, function reduce(key, vals) {
    var count = vals.reduce(function (memo, v) { return memo + v.count; }, 0);
    return {
      object_id: key.object_id,
      name: vals[0].name,
      count: count
    };
  }, {
    query: { survey: surveyId },
    finalize: function finalize(key, value) {
      if (value.count > 1) {
        return value;
      }
      return undefined;
    },
    jsMode: true,
    out: { inline: 1 }
  }, function (error, docs) {
    if (error) {
      console.log(error);
      return done(error);
    }
    var len = docs.length;
    var plurals = [];
    var i;
    for (i = 0; i < len; i += 1) {
      if (docs[i].value) {
        plurals.push(docs[i].value);
      }
    }

    done(null, plurals);
  });
}

db = mongo.connect(function () {
  async.waterfall([
    getSurveys,
    function (surveys, next) {
      async.mapSeries(surveys, function (survey, step) {
        checkSurvey(survey, function (error, plurals) {
          console.log('Checked survey ' + survey.name + ' plural features = ' + plurals.length);
          step(error, { survey: survey.name, id: survey.id, plurals: plurals });
        });
      }, next);
    }
  ], function (error, data) {
    if (error) { console.log(error); }
    console.log(JSON.stringify(data, null, 2));
    db.close();
  });
});
