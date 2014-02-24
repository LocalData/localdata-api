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
 *     centroid: []
 *   },
 *   geometry: {
 *     type: { type: String },
 *     coordinates: []
 *   },
 *   entries: [{
 *     source: {
 *       type: { type: String },
 *       collector: String,
 *       started: Date,
 *       finished: Date
 *     },
 *     created: Date,
 *     files: [String],
 *     responses: {
 *       type: Object,
 *       validate: validateResponses
 *     }
 *   }],
 *   indexedGeometry: {
 *     type: mongoose.SchemaTypes.Mixed,
 *     select: false
 *   }
 */


var util = require('util');

var _ = require('lodash');
var async = require('async');
var mongoose = require('mongoose');

var mongo = require('../lib/mongo');
var Response = require('../lib/models/Response');

var db;

function log(data) {
  if (Object.prototype.toString.call(data) === '[object Error]' ||
     (data.name && data.message)) {
    console.log('Error: ' + data.name + '. ' + data.message);
    console.log(data);
    console.log(data.stack);
    if (Object.prototype.toString.call(data.errors) === '[object Array]') {
      data.errors.forEach(log);
    } else if (data.errors) {
      log(data.errors);
    }
    return;
  }
  console.log(Object.keys(data).map(function (key) {
    return key + '=' + data[key];
  }).join(' '));
}

// When we previously fixed the geometry coordinates to convert strings to
// floats, we only processed the first ring for polygons, so we missed some
// rare "holes".
function fixFloats(data) {
  if (util.isArray(data)) {
    return data.map(fixFloats);
  }
  return parseFloat(data);
}

var limit = 1000;

function getOldChunk(skip, done) {
  log({ at: 'getOldChunk', skip: skip, limit: limit });
  // Find old objects that lack the properties.entries field.
  // We use the mongodb driver, rather than mongoose, since our Response model
  // refers to the new schema/collection.
  db.collection('responseCollection').find({
    'geo_info.centroid': {
      $exists: true
    },
    'entries': {
      $exists: false
    }
  }, {
    limit: limit,
    skip: skip,
    snapshot: true
  }, function (error, cursor) {
    if (error) { return done(error); }
    cursor.toArray(done);
  });
}

function transform (old) {
  // We have objects with a centroid but no geometry field.
  var geometry = old.geo_info.geometry;
  if (!geometry) {
    geometry = {
      type: 'Point',
      coordinates: fixFloats(old.geo_info.centroid)
    };
  } else {
    geometry.coordinates = fixFloats(geometry.coordinates);
  }

  var idxGeometry = Response.createIndexedGeometry(geometry);
  var doc = {
    properties: {
      survey: old.survey,
      centroid: old.geo_info.centroid
    },
    geometry: geometry,
    entries: [{
      _id: old._id,
      source: old.source,
      created: old.created,
      files: old.files,
      responses: old.responses
    }],
    indexedGeometry: idxGeometry
  };

  if (old.geo_info.humanReadableName) {
    doc.properties.humanReadableName = old.geo_info.humanReadableName;
  }

  // Items with a parcel_id but no object_id
  var object_id = old.object_id;
  if (!object_id) {
    object_id = old.parcel_id;
  }

  // Some items have no object_id at all.
  if (object_id) {
    doc.properties.object_id = object_id;
  }

  return doc;
}

function upsert(doc, done) {
  var entries;
  if (doc.properties.object_id) {
    entries = doc.entries;
    //doc.entries = [];
    delete doc.entries;

    var query = {
      'properties.survey': doc.properties.survey,
      'properties.object_id': doc.properties.object_id
    };

    Response.update(query, {
      // We only set the common fields when this is a brand new entry
      $setOnInsert: doc,
      // We always add entries. Make sure they are ascending order of
      // creation time.
      // In MongoDB 2.4, we can't have $sort without $slice. Since BSON
      // documents are technically bounded in size anyways, we can just provide
      // a very large number here and feel safe.
      $push: {
        'entries': {
          $each: entries,
          $slice: -1024,
          $sort: { created: 1 }
        }
      }
    }, {
      upsert: true
    }, done);
  } else {
    // For point entries that have no reference to a base layer object, we let the Model supply the object_id field.
    var newDoc = new Response(doc);
    newDoc.save(done);
  }
}

function alreadyProcessed(doc, done) {
  Response.findOne({
    'properties.survey': doc.survey,
    'entries._id': new mongoose.Types.ObjectId(doc._id.toString())
  }, function (error, doc){
    if (error) { return done(error); }
    if (doc) {
      done(null, true);
    } else {
      done(null, false);
    }
  });
}

// Eliminate the ones that already exist in the new collection
function filterChunk(docs, done) {
  log({ at: 'filterChunk' });
  async.mapLimit(docs, 20, alreadyProcessed, function (error, statuses) {
    if (error) { return done(error); }
    done(null, _.reject(docs, function (doc, i) {
      return statuses[i];
    }));
  });
}

function processChunk(docs, done) {
  log({ at: 'processChunk', filtered_count: docs.length });
  async.eachSeries(docs, function (doc, step) {
    upsert(transform(doc), function (error, saved) {
      if (error) {
        if (error.name === 'ValidationError') {
          log(error);
          console.log(JSON.stringify(doc));
          step(null);
          return;
        }
        // "Exterior shell of polygon is invalid"
        if (error.code === 16693) {
          log(error);
          console.log(JSON.stringify(doc));
          step(null);
          return;
        }
        // If we encounter a MongoError, let's keep trying to process the other
        // objects and log the offending one.
        if (error.name === 'MongoError') {
          log(error);
          console.log(JSON.stringify(doc));
          step(null);
          return;
        }
      }
      step(error);
    });
  }, done);
}

var handleChunk = async.compose(processChunk, filterChunk);

function work(done) {
  var skip = 0;
  var count;

  async.doUntil(function (next) {
    getOldChunk(skip, function (error, docs) {
      count = docs.length;
      handleChunk(docs, function (error) {
        skip += limit;
        if (error) { return next(error); }
        if (skip === 0) {
          // Make sure the indexes get created.
          Response.ensureIndexes(next);
        } else {
          next();
        }
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
    work
  ], done);
}

db = mongo.connect(function () {
  run(function (error) {
    if (error) { log(error); }
    db.close();
  });
});

db.on('error', log);
