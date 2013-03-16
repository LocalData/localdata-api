/*jslint node: true */
'use strict';

var mongoose = require('mongoose');
var makeSlug = require('slug');
var util = require('../util');

// TODO: zones
var userSchema = new mongoose.Schema({
  _id: { type: mongoose.Schema.Types.ObjectId, select: false },
  // We don't use the Mongoose version number when communicating with clients.
  __v: { type: Number, select: false },
  email: String,
  name: String,
  hash: String
});

// By default, don't include the password hash when turning a User document
// into an object.
userSchema.set('toObject', {
  transform: function (doc, ret, options) {
    return {
      _id: ret._id,
      email: ret.email,
      name: ret.name
    };
  }
});
