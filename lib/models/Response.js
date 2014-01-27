/*jslint node: true */
'use strict';

var mongoose = require('mongoose');
var util = require('../util');

function validateResponses (val) {
  return val !== undefined;
}

var responseSchema = new mongoose.Schema({
  // We don't use the native mongo ID when communicating with clients.
  _id: { type: mongoose.Schema.Types.ObjectId, select: false },
  __v: { type: Number, select: false },
  id: String,
  survey: String,
  source: {
    type: { type: String },
    collector: String,
    started: Date,
    finished: Date
  },
  created: Date,
  geo_info: {
    centroid: [Number],
    parcel_id: String,
    points: { type: [], select: false },
    geometry: {
      type: { type: String },
      coordinates: []
    },
    humanReadableName: String
  },
  files: [String],
  parcel_id: String,
  object_id: String,
  responses: {
    type: Object,
    validate: validateResponses
  }
}, {
  autoIndex: false
});

// Indexes

// Ensure we have a geo index on the centroid field.
// We always restrict based on survey ID, so we use a compound index.
responseSchema.index({ 'geo_info.centroid': '2d', survey: 1 });

// Index the survey ID + creation date, which we use to sort
// Descending
responseSchema.index({ survey: 1, created: 1 });
// Ascending
responseSchema.index({ survey: 1, created: -1 });

// Index the survey ID, which we use to look up sets of responses
responseSchema.index({ survey: 1 });

// Index the collector name
responseSchema.index({ survey: 1, 'source.collector': 1, created: 1 });

// Index the parcel ID
responseSchema.index({ survey: 1, parcel_id: 1 });

// Index the object ID
responseSchema.index({ survey: 1, object_id: 1 });

responseSchema.set('toObject', {
  transform: function (doc, ret, options) {
    return {
      id: ret.id,
      survey: ret.survey,
      source: ret.source,
      created: ret.created,
      geo_info: {
        centroid: ret.geo_info.centroid,
        parcel_id: ret.geo_info.parcel_id,
        geometry: ret.geo_info.geometry,
        humanReadableName: ret.geo_info.humanReadableName
      },
      files: ret.files,
      parcel_id: ret.parcel_id,
      object_id: ret.object_id,
      responses: ret.responses
    };
  }
});


responseSchema.pre('save', function parseCentroid(next) {
  // check if there is a centroid. if yes, make sure the values are floats
  // TODO: abstract into a testable function.
  if (this.geo_info !== undefined) {
    var centroid = this.geo_info.centroid;
    if (centroid !== undefined) {
      centroid[0] = parseFloat(centroid[0]);
      centroid[1] = parseFloat(centroid[1]);
    }
  }
  next();
});


function simplify(ring) {
  // FIXME: Simplify the ring
  return ring;
}

function collectRingPoints(memo, ring) {
  simplify(ring).forEach(function (point) {
    memo.push(point);
  });
}

function collectPolygonPoints(memo, polygon) {
  polygon.forEach(function (ring) {
    collectRingPoints(memo, ring);
  });
}

function collectMultiPolygonPoints(memo, multiPolygon) {
  multiPolygon.forEach(function (polygon) {
    collectPolygonPoints(memo, polygon);
  });
}

// Collect all of the coordinates into one array, so we can index them.
responseSchema.pre('save', function collectPoints(next) {
  if (this.geometry !== undefined) {
    if (this.geometry.type === 'MultiPolygon') {
      this.geo_info.points = [];
      collectMultiPolygonPoints(this.geo_info.points, this.geo_info.geometry.coordinates);
    } else if (this.geometry.type === 'Polygon') {
      this.geo_info.points = [];
      collectPolygonPoints(this.geo_info.points, this.geo_info.geometry.coordinates);
    } else if (this.geometry.type === 'Point') {
      this.geo_info.points = this.geo_info.geometry.coordinates;
    }
  }
  next();
});

// Set the ID.
responseSchema.pre('save', function setId(next) {
  this.id = util.uuidv1();
  next();
});

// Set the creation date.
responseSchema.pre('save', function setCreated(next) {
  if (this.created === undefined) {
    this.created = new Date();
  }
  next();
});

// Allow either parcel_id or object_id.
// Eventually we'll deprecate parcel_id.
responseSchema.pre('save', function setObjectId(next) {
  if (this.parcel_id !== undefined && this.object_id === undefined) {
    this.object_id = this.parcel_id;
  } else if (this.object_id !== undefined && this.parcel_id === undefined) {
    this.parcel_id = this.object_id;
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
        point: '$geo_info.centroid'
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
