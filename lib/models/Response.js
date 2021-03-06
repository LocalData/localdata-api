/*jslint node: true */
'use strict';

var _ = require('lodash');
var async = require('async');
var mongoose = require('mongoose');
var turf = require('turf');
var util = require('../util');

function validateResponses (val) {
  return val !== undefined && val !== null;
}

var entrySchema = new mongoose.Schema({
  source: {
    type: { type: String },
    collector: String,
    started: Date,
    finished: Date
  },
  created: Date,
  modified: Date,
  files: [String],
  responses: {
    type: Object,
    validate: validateResponses
  }
}, {
  minimize: false
});

entrySchema.set('toObject', {
  transform: function (doc, ret, options) {
    return {
      id: ret._id,
      _id: ret._id,
      source: ret.source,
      created: ret.created,
      modified: ret.modified,
      files: ret.files,
      responses: ret.responses
    };
  }
});

var responseSchema = new mongoose.Schema({
  __v: { type: Number, select: false },
  properties: {
    // survey is a String for active Response docs and an object for "zombie"
    // Response docs that hold deleted entries.
    // TODO: add validation or a custom type for the survey field
    survey: mongoose.SchemaTypes.Mixed,
    humanReadableName: String,
    object_id: { type: String },
    info: {},
    centroid: []
  },
  geometry: {
    type: { type: String },
    coordinates: []
  },
  entries: [entrySchema],
  indexedGeometry: {type: mongoose.SchemaTypes.Mixed, select: false}
}, {
  autoIndex: false
});


// Indexes

// Ensure we have a geo index on the centroid field.
// We always restrict based on survey ID, so we use a compound index.
responseSchema.index({
  'properties.survey': 1,
  'indexedGeometry': '2dsphere',
  'entries.modified': 1
});

// Index the survey ID + entry ID. We expose entry ID to clients.
responseSchema.index({
  'properties.survey': 1,
  'entries._id': 1
});

// Index the survey ID + creation date, which we use to sort
responseSchema.index({
  'properties.survey': 1,
  'entries.created': 1
});

// Index the survey ID + modification time, which we use for validating cached
// data.
responseSchema.index({
  'properties.survey': 1,
  'entries.modified': 1
});

// Index the collector name
responseSchema.index({
  'properties.survey': 1,
  'source.collector': 1,
  'entries.created': 1
});

// Index the survey + object ID
// We use a unique index because multiple entries for the same survey and base
// feature will get stored in one object.
// For documents with a "free geometry", that do not correspond to some base
// layer feature, the object_id is the same as the reponse documents _id
responseSchema.index({
  'properties.survey': 1,
  'properties.object_id': 1
}, { unique: true });

responseSchema.set('toObject', {
  transform: function (doc, ret, options) {
    // Return the array of entries in the GeoJSON properties field.
    ret.properties.entries = ret.entries;

    return {
      type: 'Feature',
      id: ret._id,
      properties: ret.properties,
      geometry: ret.geometry
    };
  }
});

responseSchema.methods.getSingleEntry = function getSingleEntry(id) {
  var doc = this.toObject();
  var entry = this.entries.id(id);
  return {
    type: 'Feature',
    id: entry._id,
    // Merge the selected entry's field into the GeoJSON properties field
    properties: _.assign(doc.properties, entry.toObject()),
    geometry: doc.geometry
  };
};

responseSchema.methods.getLatestEntry = function getLatestEntry() {
  var doc = this.toObject();
  var entry = this.entries[this.entries.length - 1];
  return {
    type: 'Feature',
    id: entry._id,
    // Merge the selected entry's field into the GeoJSON properties field
    properties: _.assign(doc.properties, entry.toObject()),
    geometry: doc.geometry
  };
};

responseSchema.methods.toUpsertDoc = function toUpsertDoc() {
  var doc = this.toObject({ virtuals: false});
  var entries = doc.entries;
  delete doc.entries;
  delete doc._id;
  return {
    // We only set the common fields when this is a brand new entry
    $setOnInsert: doc,
    // We always add entries. Make sure they are ascending order of
    // creation time.
    $push: {
      'entries': {
        $each: entries,
        $slice: -1024,
        $sort: { created: 1 }
      }
    }
  };
};

// Manually apply pre-save middleware, since that doesn't happen for
// Model.update calls.
responseSchema.methods.applyPreSave = function applyPreSave(done) {
  var response = this;
  async.eachSeries(response._pres.save, function (f, step) {
    f.call(response, step);
  }, function (error) {
    done(error);
  });
};

responseSchema.pre('save', function parseCentroid(next) {
  // check if there is a centroid. if yes, make sure the values are floats
  // TODO: abstract into a testable function.
  var centroid = this.properties.centroid;
  if (centroid !== undefined) {
    centroid[0] = parseFloat(centroid[0]);
    centroid[1] = parseFloat(centroid[1]);
  }
  next();
});

// For each string of coordinates, remove repeats.
// Apply the util.simplify algorithm, too, to get rid of troublesome points
// that have caused self-intersecting geometries through rounding errors.
function simplifyLineString(coordinates) {
  var i;
  var len = coordinates.length;
  var newCoords = [coordinates[0]];
  for (i = 1; i < len; i += 1) {
    var last = newCoords[newCoords.length - 1];
    if (coordinates[i][0] !== last[0] &&
        coordinates[i][1] !== last[1]) {
      newCoords.push(coordinates[i]);
    }
  }
  return newCoords;
}

function createIndexedGeometry(geometry) {
  var geom = {
    type: geometry.type,
    coordinates: geometry.coordinates
  };

  if (geom.type === 'GeometryCollection') {
    // For GeometryCollections, we just use the first geometry.
    geom = geom.geometries[0];
  }

  // For Point, we don't need to do anything.
  if (geom.type === 'LineString') {
    if (geom.coordinates.length > 50) {
      geom = util.simplifyCoordinates(geom, 1E-5);
    }
    geom.coordinates = simplifyLineString(geom.coordinates);
  } else if (geom.type === 'Polygon' ||
             geom.type === 'MultiPolygon' ||
             geom.type === 'MultiLineString' ||
             geom.type === 'MultiPoint') {
    // For polygons and multi-geometries, we index a polygon made from the
    // bounding box of the geometry. This helps avoid issues with bad polygons
    // (repeated points, zero-area pieces, crossovers, etc.), and it avoids
    // performance issues with super-complicated geometries (100s or over 1000
    // coordinates).
    var tmp = {
      type: 'Feature',
      geometry: geom
    };

    var envelope = turf.envelope(tmp);

    // If the bounding box has an area of 0, then we have a degenerate polygon
    // and need to fall back to indexing a single point.
    if (turf.area(envelope) === 0) {
      geom = turf.centroid(tmp).geometry;
    } else {
      geom = envelope.geometry;
    }
  }
  return geom;
}

responseSchema.statics.createIndexedGeometry = createIndexedGeometry;

// Save a simplified geometry that MongoDB knows how to index. As of 2.4, that
// includes Point, LineString, and Polygon.
responseSchema.pre('save', function addIndexedGeometry(next) {
  // Make sure there is a geometry.
  if (this.geometry === undefined) {
    console.log('warning at=response_schema issue=no_geometry object_id=' +
                this.properties.object_id + ' survey=' + this.survey);
    return next();
  }

  this.indexedGeometry = createIndexedGeometry(this.geometry);

  next();
});

// Set the creation and modified date.
responseSchema.pre('save', function setCreated(next) {
  this.entries.forEach(function (entry) {
    var d = new Date();
    if (entry.created === undefined) {
      entry.created = d;
    }
    entry.modified = d; // always set the modified date
  });
  next();
});

// If no object_id property was specified, then this document becomes its own
// "base layer feature".
responseSchema.pre('save', function setObjectId(next) {
  if (!this.properties.object_id) {
    this.properties.object_id = this._id.toString();
  }

  next();
});

responseSchema.statics.countEntries = function countEntries(query, done) {
  this.aggregate([
    {
      $match: query
    },
    {
      $project: {
        entries: '$entries'
      }
    },
    {
      $unwind: '$entries'
    },
    {
      $group: {
        _id: 'entries',
        count: { $sum: 1 }
      }
    }
  ], function (error, result) {
    if (error) { return done(error); }

    var count = 0;
    // If there are no entries for the survey, then nothing will even match the
    // $match stage
    if (result.length > 0) {
      count = result[0].count;
    }

    done(null, count);
  });
};

responseSchema.statics.getBounds = function getBounds(survey, done) {
  this.aggregate([
    {
      $match: { 'properties.survey': survey }
    },
    {
      $project: {
        _id: '$_id',
        point: '$properties.centroid'
      }
    },
    {
      $unwind: '$point'
    },
    {
      $group: {
        _id: '$_id',
        x: { $first: '$point' },
        y: { $last: '$point' }
      }
    },
    {
      $group: {
        _id: 'bbox',
        minx: { $min: '$x' },
        miny: { $min: '$y' },
        maxx: { $max: '$x' },
        maxy: { $max: '$y' }
      }
    }
  ], function (error, response) {
    if (error) { return done(error); }

    if (response.length === 0) {
      return done(null, null);
    }

    var data = response[0];
    var bbox = [[ data.minx, data.miny ], [ data.maxx, data.maxy ]];
    done(null, bbox);
  });
};

var Response = module.exports = mongoose.model('Response', responseSchema, 'responses');
