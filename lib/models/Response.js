/*jslint node: true */
'use strict';

var _ = require('lodash');
var mongoose = require('mongoose');
var util = require('../util');

function validateResponses (val) {
  return val !== undefined;
}

var entrySchema = new mongoose.Schema({
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
});

entrySchema.set('toObject', {
  transform: function (doc, ret, options) {
    return {
      id: ret._id,
      source: ret.source,
      created: ret.created,
      files: ret.files,
      responses: ret.responses
    };
  }
});

var responseSchema = new mongoose.Schema({
  __v: { type: Number, select: false },
  properties: {
    survey: String,
    humanReadableName: String,
    object_id: { type: String },
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
  'entries.created': 1
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
    // Gross. Looks like this was fixed and then reverted in Mongoose:
    // https://github.com/LearnBoost/mongoose/issues/1412
    // https://github.com/LearnBoost/mongoose/pull/1620
    if ('function' === typeof doc.ownerDocument) {
      // Let the subdoc handle it.
      var toObject = doc.schema.get('toObject');
      var transform;
      if (toObject) {
        transform = toObject.transform;
      }
      if (transform) {
        return doc.toObject({
          transform: transform
        }, options);
      }
      return ret;
    }

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
  return this.toObject({
    transform: function (doc, ret, options) {
      var entry = doc.entries.id(id);
      return {
        type: 'Feature',
        id: ret._id,
        // Merge the selected entry's field into the GeoJSON properties field
        properties: _.assign(ret.properties, entry.toObject()),
        geometry: ret.geometry
      };
    }
  });
};

responseSchema.methods.getLatestEntry = function getLatestEntry() {
  return this.toObject({
    transform: function (doc, ret, options) {
      var entries = doc.entries;
      var entry = entries[entries.length - 1];
      return {
        type: 'Feature',
        id: ret._id,
        properties: _.assign(ret.properties, entry.toObject()),
        geometry: ret.geometry
      };
    }
  });
};

responseSchema.methods.toUpsertDoc = function toUpsertDoc() {
  return this.toObject({
    transform: function transform(doc, ret, options) {
      var entries = ret.entries;
      delete ret._id;
      delete ret.entries;
      return {
        // We only set the common fields when this is a brand new entry
        $setOnInsert: ret,
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
    }
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

function getSingle(geometry) {
  // If MongoDB knows how to work with this geometry, then our job is easy.
  var type = geometry.type;
  if (type === 'Polygon' ||
      type === 'LineString' ||
      type === 'Point') {
    return geometry;
  }

  var geom;
  if (type === 'GeometryCollection') {
    // For GeometryCollections, we just index the first geometry, or a
    // simplified version of that if its a Multi* geometry.
    // This is similar to what we do right now with MultiPolygon/etc.
    geom = geometry.geometries[0];

    if (geom.type === 'Polygon' ||
        geom.type === 'LineString' ||
        geom.type === 'Point') {
      return geom;
    }
  } else {
    geom = geometry;
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

  return {
    type: newType,
    coordinates: geom.coordinates[0]
  };
}

// For each string of coordinates, remove repeats.
function simplifyLineString(coordinates) {
  var i;
  var len = coordinates.length;
  var newCoords = [coordinates[0]];
  for (i = 1; i < len; i += 1) {
    if (coordinates[i][0] !== coordinates[i-1][0] &&
        coordinates[i][1] !== coordinates[i-1][1]) {
      newCoords.push(coordinates[i]);
    }
  }
  return newCoords;
}

function createIndexedGeometry(geometry) {
  var geom = getSingle(geometry);

  // For Point, we don't need to do anything.
  if (geom.type === 'LineString') {
    geom.coordinates = simplifyLineString(geom.coordinates);
  } else if (geom.type === 'Polygon') {
    // Polygon
    geom.coordinates = geom.coordinates.map(simplifyLineString);
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

// Set the creation date.
responseSchema.pre('save', function setCreated(next) {
  this.entries.forEach(function (entry) {
    if (entry.created === undefined) {
      entry.created = new Date();
    }
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

responseSchema.statics.getBounds = function getBounds(survey, done) {
  var bbox = [[-180, -89], [180, 89]];
  this.aggregate([
    {
      $match: { survey: survey }
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
