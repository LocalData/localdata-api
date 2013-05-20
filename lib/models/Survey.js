/*jslint node: true */
'use strict';

var mongoose = require('mongoose');
var makeSlug = require('slugs');
var util = require('../util');

// TODO: zones
var surveySchema = new mongoose.Schema({
  // We don't use the native mongo ID when communicating with clients.
  _id: { type: mongoose.Schema.Types.ObjectId, select: false },
  __v: { type: Number, select: false },
  id: String,
  name: { type: String, required: true },
  slug: String,
  // Survey type: null, which is equivalent to 'parcel'; 'point', or 'pointandparcel'
  type: {
    type: String
  },
  // Location of the survey (eg 'Detroit, MI')
  location: String,
  // For safety, exclude the users list by default.
  users: { type: [String], select: false },
  paperinfo: {
    type: {
      dpi: { type: Number, required: true },
      regmarks: [{ type: { type: Number, required: true }, bbox: {type: [Number], required: true } }],
      barcode: {
        bbox: { type: [Number], required: true }
      }
    },
    required: null
  },
  zones: {
    type: {
      type: String
    },
    features: []
  },
  exports: {
    type: {
      shapefile: {
        type: {
          requested: Date,
          url: String
        },
        required: false
      }
    },
    required: false,
    select: false
  }
});

surveySchema.set('toObject', {
  transform: function (doc, ret, options) {
    return {
      id: ret.id,
      name: ret.name,
      users: ret.users,
      slug: ret.slug,
      type: ret.type,
      location: ret.location,
      paperinfo: ret.paperinfo,
      zones: ret.zones
    };
  }
});

function checkSlugHelper(name, index, done) {
  var slug = makeSlug(name);
  if (index > 0) {
    slug = slug + '-' + index;
  }
  mongoose.model('Survey').findOne({ slug: slug }, function (error, doc) {
    if (error) {
      return done(error);
    }
    if (doc === null) {
      return done(null, slug);
    }
    checkSlugHelper(name, index + 1, done);
  });
}

// Set the slug.
surveySchema.pre('save', function checkSlug(next) {
  if (!this.name) {
    return next({
      name: 'ValidationError',
      message: 'Survey name required'
    });
  }

  if (this.slug) {
    next();
  }

  var self = this;
  checkSlugHelper(this.name, 0, function (error, slug) {
    if (error) {
      return next(error);
    }
    self.slug = slug;
    next();
  });
});

// Set the ID.
surveySchema.pre('save', function setId(next) {
  if (!this.id) {
    this.id = util.uuidv1();
  }
  next();
});

var Survey = module.exports = mongoose.model('Survey', surveySchema, 'surveyCollection');
