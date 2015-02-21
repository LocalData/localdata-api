/*jslint node: true */
'use strict';

var mongoose = require('mongoose');

var cacheItemSchema = new mongoose.Schema({
  _id: {
    cache: String,
    key: String
  },
  accessed: {
    type: Date,
    expires: '7d'
  },
  contents: {}
}, {
  _id: false
});

module.exports = mongoose.model('CacheItem', cacheItemSchema, 'cacheItems');
