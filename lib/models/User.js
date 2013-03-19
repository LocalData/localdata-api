/*jslint node: true */
'use strict';

var mongoose = require('mongoose');
var makeSlug = require('slug');
var bcrypt = require('bcrypt');
var util = require('../util');

var userSchema = new mongoose.Schema({
  //_id: { type: mongoose.Schema.Types.ObjectId, select: true },
  // We don't use the Mongoose version number when communicating with clients.
  __v: { type: Number, select: false },
  email: { type: String, required: true },
  name: String,
  hash: { type: String, required: true }
});

userSchema.virtual('password').set(function (password) {
  this.hash = bcrypt.hashSync(password, 10);
});

userSchema.methods.validPassword = function validPassword(password) {
  return bcrypt.compareSync(password, this.hash);
};

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

var User = module.exports = mongoose.model('User', userSchema, 'usersCollection');
