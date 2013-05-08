/*jslint node: true */
'use strict';

var mongoose = require('mongoose');
var util = require('../util');

var formSchema = new mongoose.Schema({
  // We don't use the native mongo ID when communicating with clients.
  _id: { type: mongoose.Schema.Types.ObjectId, select: false },
  __v: { type: Number, select: false },
  id: String,
  survey: String,
  created: Date,
  type: { type: String },
  questions: [], // Used by mobile forms
  global: {}, // Used by paper forms
  parcels: [] // Used by paper forms
}, {
  autoIndex: false
});

// Indexes

// Index the creation date, which we use to sort
formSchema.index({ survey: 1, created: -1 });

// Index the parcel IDs, used by paper forms
formSchema.index({ survey: 1, 'parcels.parcel_id': 1 });

// We use survey ID and form ID when modifying a form.
formSchema.index({ survey: 1, id: 1 });

formSchema.set('toObject', {
  transform: function (doc, ret, options) {
    var obj = {
      id: ret.id,
      survey: ret.survey,
      created: ret.created,
      type: ret.type
    };

    if (ret.type === 'mobile') {
      obj.questions = ret.questions;
    } else if (ret.type === 'paper') {
      obj.global = ret.global;
      obj.parcels = ret.parcels;
    }

    return obj;
  }
});

// Set the ID.
formSchema.pre('save', function setId(next) {
  this.id = util.uuidv1();
  next();
});

// Set the creation date.
formSchema.pre('save', function setCreated(next) {
  this.created = new Date();
  next();
});

var Form = module.exports = mongoose.model('Form', formSchema, 'formCollection');
