/*jslint node: true */
'use strict';

var mongoose = require('mongoose');
var util = require('../util');

var orgSchema = new mongoose.Schema({
  // We don't use the Mongoose version number when communicating with clients.
  __v: { type: Number, select: false },
  name: { type: String, required: true, unique: true },
  // For safety, exclude the users list by default.
  users: { type: [String], select: false }
}, {
  autoIndex: false
});

// Indexes
// Index the users
orgSchema.index({ users: 1 });
// Make sure the name is unique
orgSchema.index({ name: 1 }, { unique: true });

// Include the "id" field but leave out the "_id" field.
var conversionOptions = {
  getters: true,
  transform: function (doc, ret, options) {
    return {
      id: ret.id,
      name: ret.name,
      users: ret.users
    };
  }
};

orgSchema.set('toObject', conversionOptions);
orgSchema.set('toJSON', conversionOptions);

var Org = module.exports = mongoose.model('Org', orgSchema, 'orgCollection');
