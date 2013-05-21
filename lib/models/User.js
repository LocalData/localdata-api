/*jslint node: true */
'use strict';

var mongoose = require('mongoose');
var bcrypt = require('bcrypt');
var util = require('../util');

function hashToken(item) {
  return bcrypt.hashSync(item, 10);
}

var userSchema = new mongoose.Schema({
  //_id: { type: mongoose.Schema.Types.ObjectId, select: true },
  // We don't use the Mongoose version number when communicating with clients.
  __v: { type: Number, select: false },
  email: {
    type: String,
    required: true,
    unique: true
  },
  name: String,
  hash: { type: String, required: true },
  reset: {
    type: {
      hashedToken: String,
      expiry: Date
    },
    required: false
  }
}, {
  autoIndex: false
});

// Indexes
// Make sure email is unique
userSchema.index({ email: 1 }, { unique: true });

userSchema.virtual('password').set(function (password) {
  this.hash = hashToken(password);
});

userSchema.methods.validPassword = function validPassword(password) {
  return bcrypt.compareSync(password, this.hash);
};

userSchema.methods.hashToken = hashToken;
userSchema.statics.hashToken = hashToken;

// By default, don't include the password hash when turning a User document
// into an object.
userSchema.set('toObject', {
  transform: function (doc, ret, options) {
    return {
      _id: ret._id,
      email: ret.email,
      name: ret.name,
      reset: ret.reset
    };
  }
});

var User = module.exports = mongoose.model('User', userSchema, 'usersCollection');
