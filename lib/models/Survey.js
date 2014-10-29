/*jslint node: true */
'use strict';

var mongoose = require('mongoose');
var makeSlug = require('slugs');
var util = require('../util');
var __ = require('lodash');

// TODO: zones
var surveySchema = new mongoose.Schema({
  id: String,
  name: { type: String, required: true },
  slug: String,
  created: Date,

  // Survey type: null, which is equivalent to 'parcel'; 'point', or 'pointandparcel'
  type: {
    type: String
  },

  // Location of the survey (eg 'Detroit, MI')
  location: String,
  timezone: String,

  // Optional custom tilelayer
  // eg 'http://{s}.tile.cloudmade.com/{key}/{styleId}/256/{z}/{x}/{y}.png'
  tilelayer: String,

  // Optional description of the survey
  description: String,

  // Optional object describing the data source
  // For ArcGIS connections:
  // "type": "ArcGIS Server",
  // "endpoint": "http://arcgis...",
  // "name": [
  //     "HouseNumber",
  //     "PrefixDirectional",
  //     "StreetName"
  // ],
  // "id": "parcelIDField"
  //
  //  For the features endpoint:
  //   "type": "LocalData",
  //   "source": "/api/features?source=detroit-streetlights&bbox={{bbox}}"
  geoObjectSource: Object,

  // Optional number of milliseconds responses are good for
  // Responses older than this date may be considered stale by clients
  responseLongevity: Number,

  // Optional settings that can configure front- and back-end behavior
  surveyOptions: {},

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
    required: false
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
}, {
  autoIndex: false
});

// Indexes

// Index the slug field.
surveySchema.index({ slug: 1 });

// Index the survey ID.
surveySchema.index({ id: 1 });

// Index the users
surveySchema.index({ users: 1 });

surveySchema.set('toObject', {
  transform: function (doc, ret, options) {
    return {
      id: ret.id,
      name: ret.name,
      created: ret.created,
      users: ret.users,
      slug: ret.slug,
      type: ret.type,
      location: ret.location,
      timezone: ret.timezone,
      tilelayer: ret.tilelayer,
      description: ret.description,
      responseLongevity: ret.responseLongevity,
      surveyOptions: ret.surveyOptions,
      geoObjectSource: ret.geoObjectSource,
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

surveySchema.pre('save', function checkSlug(next) {
  // Add the created date
  if (this.created === undefined) {
    this.created = new Date();
  }

  if (this.slug) {
    next();
  }

  // Set the slug.
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

/**
 * Return a survey if it is owned by the user.
 * @param  {String}  surveyId ID of the survey
 * @param  {String} userId
 * @param  {Function} callback params error, survey
 *                             error in format { code, message }
 */
 surveySchema.statics.findIfOwnedByUser = function (surveyId, userId, cb) {
  // Must include a userId parameter
  if(userId === undefined) {
    cb({code: 401, name: "UnauthorizedError", message: "No user specified"});
  }

  this.find({ id: surveyId }).select('+users').exec(function(error, surveys) {
    if (surveys.length === 0) {
      cb({code: 404, name: "SurveyNotFoundError", message: "Survey not found"});
      return;
    }

    if (surveys.length > 1) {
      cb({code: 500, name: "UnexpectedDataError", message: "Too many surveys found"});
      console.error("Error: multiple surveys with same ID");
      return;
    }

    var survey = surveys[0];

    if (__.contains(survey.users, userId)) {
      survey.users = undefined; // for security
      cb(null, survey);
      return;
    }

    cb({code: 403, name:"ForbiddenError", message: "Access denied"});
  });

};


var Survey = module.exports = mongoose.model('Survey', surveySchema, 'surveyCollection');
