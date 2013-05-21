/*jslint node: true */
'use strict';

var mongoose = require('mongoose');
var util = require('../util');

var orgSchema = new mongoose.Schema({
  _id: { type: String },
  // We don't use the Mongoose version number when communicating with clients.
  __v: { type: Number, select: false },
  name: { type: String, required: true },
  // For safety, exclude the users list by default.
  users: { type: [String], select: false }
}, {
  autoIndex: false
});

// Index the users
orgSchema.index({ users: 1 });

orgSchema.set('toObject', {
  getters: true,
  transform: function (doc, ret, options) {
    return {
      id: ret.id,
      name: ret.name,
      users: ret.users
    };
  }
});

// Set the ID.
orgSchema.pre('save', function setId(next) {
  if (!this._id) {
    this._id = util.uuidv1();
  }
  next();
});

var Org = module.exports = mongoose.model('Org', orgSchema, 'orgCollection');
