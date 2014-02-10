/*jslint node: true */
'use strict';

var mongoose = require('mongoose');
var util = require('../util');

function validateResponses (val) {
  return val !== undefined;
}

var responseSchema = new mongoose.Schema({
  __v: { type: Number, select: false },
  properties: {
    survey: String,
    humanReadableName: String,
    object_id: String,
    entries: [ {
      source: {
        type: { type: String },
        collector: String,
        started: Date,
        finished: Date
      },
      created: Date,
      files: [String],
      responses: {
        type: Object,
        validate: validateResponses
      }
    } ],
    centroid: [],
    indexedGeometry: {
      type: {
        type: { type: String },
        coordinates: []
      },
      select: false
    }
  },
  geometry: {
    type: { type: String },
    coordinates: []
  }
}, {
  autoIndex: false
});

// Indexes

// Ensure we have a geo index on the centroid field.
// We always restrict based on survey ID, so we use a compound index.
responseSchema.index({ survey: 1, 'properties.indexedGeometry': '2dsphere', created: 1 });

// Index the survey ID + creation date, which we use to sort
responseSchema.index({ survey: 1, created: 1 });

// Index the collector name
responseSchema.index({ survey: 1, 'source.collector': 1, created: 1 });

// Index the object ID
responseSchema.index({ survey: 1, object_id: 1 });

responseSchema.set('toObject', {
  transform: function (doc, ret, options) {
    return {
      type: 'Feature',
      id: ret._id,
      properties: ret.properties,
      geometry: ret.geometry
    };
  }
});


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

// Save a simplified geometry that MongoDB knows how to index. As of 2.4, that
// includes Point, LineString, and Polygon.
responseSchema.pre('save', function createIndexedGeometry(next) {
  // Make sure there is a geometry.
  if (this.geometry === undefined) {
    console.log('warning at=response_schema issue=no_geometry object_id=' +
                this.properties.object_id + ' survey=' + this.survey);
    return next();
  }

  // If MongoDB knows how to work with this geometry, then our job is easy.
  var type = this.geometry.type;
  if (type === 'Polygon' ||
      type === 'LineString' ||
      type === 'Point') {
    this.properties.indexedGeometry = this.geometry;
    return next();
  }

  var geometry;
  if (type === 'GeometryCollection') {
    // For GeometryCollections, we just index the first geometry, or a
    // simplified version of that if its a Multi* geometry.
    // This is similar to what we do right now with MultiPolygon/etc.
    geometry = this.geometry.geometries[0];

    if (geometry.type === 'Polygon' ||
        geometry.type === 'LineString' ||
        geometry.type === 'Point') {
      this.properties.indexedGeometry = geometry;
      return next();
    }
  } else {
    geometry = this.geometry;
  }

  var newType;
  switch (geometry.type) {
    case 'MultiPoint':
      newType = 'Point';
      break;
    case 'MultiLineString':
      newType = 'LineString';
      break;
    case 'MultiPolygon':
      newType = 'Polygon';
      break;
  }
  this.indexedGeometry = {
    type: newType,
    coordinates: geometry.coordinates[0]
  };

  next();
});

// Set the creation date.
responseSchema.pre('save', function setCreated(next) {
  if (this.properties.created === undefined) {
    this.properties.created = new Date();
  }
  next();
});

// Allow either parcel_id or object_id in the input, but only store object_id
// in the database.
// parcel_id is deprecated.
responseSchema.pre('save', function setObjectId(next) {
  if (this.parcel_id !== undefined && this.object_id === undefined) {
    this.object_id = this.parcel_id;
    delete this.parcel_id;
    console.log('warning at=response_schema issue=deprecated feature=response_parcel_id');
  }
  next();
});

responseSchema.statics.getBounds = function getBounds(survey, done) {
  var bbox = [[-180, -89], [180, 89]];
  this.aggregate([
    {
      $match: { survey: survey }
    },
    {
      $project: {
        _id: '$_id',
        point: 'properties.centroid'
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

var Response = module.exports = mongoose.model('Response', responseSchema, 'responseCollection');
