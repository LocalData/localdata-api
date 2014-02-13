/*jslint node: true */

/*
 * Migrate between Response structures.
 * Old structure was current until February 2014.
 * New structure became current in mid-February 2014.
 * The new structure stores one Response object per base layer feature. Entries
 * are stored in an array within a Response, so that multiple entries may be
 * tracked.
 *
 * Usage:
 *   $ envrun -e my-deployment.env node migrate-single-response.js
 *
 * Or run on Heroku to mitigate network latency.
 */
'use strict';

/*
 * OLD format
 * {
 *   _id: ObjectId,
 *   __v: Number,
 *   id: String,
 *   survey: String,
 *   source: {
 *     type: { type: String },
 *     collector: String,
 *     started: Date,
 *     finished: Date
 *   },
 *   created: Date,
 *   geo_info: {
 *     centroid: [Number],
 *     parcel_id: String,
 *     points: { type: [], select: false },
 *     geometry: {
 *       type: { type: String },
 *       coordinates: []
 *     },
 *     humanReadableName: String
 *   },
 *   files: [String],
 *   parcel_id: String,
 *   object_id: String,
 *   responses: {
 *     type: Object,
 *     validate: validateResponses
 *   }
 * }
 *
 * NEW format
 * {
 *   _id: ObjectId,
 *   __v: Number,
 *   properties: {
 *     survey: String,
 *     humanReadableName: String,
 *     object_id: String,
 *     entries: [{
 *       source: {
 *         type: { type: String },
 *         collector: String,
 *         started: Date,
 *         finished: Date
 *       },
 *       created: Date,
 *       files: [String],
 *       responses: {
 *         type: Object,
 *         validate: validateResponses
 *       }
 *     }]
 *     centroid: [],
 *     indexedGeometry: {
 *       type: {
 *         type: { type: String },
 *         coordinates: []
 *       },
 *       select: false
 *     }
 *   },
 *   geometry: {
 *     type: { type: String },
 *     coordinates: []
 *   }
 */


var _ = require('lodash');
var async = require('async');

var mongo = require('../lib/mongo');
var Response = require('../lib/models/Response');

var db;

function log(data) {
  console.log(Object.keys(data).map(function (key) {
    return key + '=' + data[key];
  }).join(' '));
}

var limit = 1000;

function getOldChunk(skip, done) {
  log({ skip: skip, limit: limit });
  // Find old objects that lack the properties.entries field.
  db.collection('responseCollection').find({
    'geo_info.centroid': {
      $exists: true
    },
    'properties.entries': {
      $exists: false
    }
  })
  .lean()
  .snapshot()
  .limit(limit)
  .skip(skip)
  .exec(done);
}

function transform (old) {
  // We have objects with a centroid but no geometry field.
  var geometry = old.geo_info.geometry;
  if (!geometry) {
    geometry = {
      type: 'Point',
      coordinates: old.geo_info.centroid
    };
  }

  // Objects with a parcel_id but no object_id
  var object_id = old.object_id;
  if (!object_id) {
    object_id = old.parcel_id;
  }

  var doc = {
    properties: {
      survey: old.survey,
      humanReadableName: old.geo_info.humanReadableName,
      object_id: old.geo_info.object_id,
      entries: [{
        _id: old._id,
        source: old.source,
        created: old.created,
        files: old.files,
        responses: old.responses
      }],
      centroid: old.geo_info.centroid,
      indexedGeometry: Response.createIndexedGeometry(geometry)
    },
    geometry: geometry
  };
}

function upsert(doc, done) {
  var entries = doc.properties.entries;
  doc.properties.entries = [];

  Response.update({
    'properties.survey': doc.properties.surveyId,
    'properties.object_id': doc.properties.object_id
  }, {
    // We only set the common fields when this is a brand new entry
    $setOnInsert: doc,
    // We always add entries. Make sure they are ascending order of
    // creation time.
    $push: {
      'properties.responses.entries': {
        $each: entries,
        $sort: { created: 1 }
      }
    }
  }, {
    upsert: true
  }, done);
}

function process(done) {
  var skip = 0;
  var count;

  async.doUntil(function (next) {
    getOldChunk(skip, function (error, docs) {
      count = docs.length;
      async.eachSeries(docs, function (doc, step) {
        upsert(transform(doc), step);
      }, function (error) {
        skip += limit;
        next(error);
      });
    });
  },
  function () {
    return count < limit;
  },
  done);
}

function run(done) {
  async.series([
    _.bind(Response.ensureIndexes, Response),
    process
  ], done);
}

db = mongo.connect(function () {
  process(function () {
    db.close();
  });
});
