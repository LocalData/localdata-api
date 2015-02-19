/*jslint node: true */
'use strict';

var Promise = require('bluebird');

var CacheItem = require('../models/CacheItem');
var settings = require('../../settings');

var CACHE_NAME_PREFIX = 'api-cache-' + settings.name + '-';

Promise.promisifyAll(CacheItem);

exports.get = function get(cache, name) {
  return CacheItem.findOneAndUpdateAsync({
    _id: {
      cache: CACHE_NAME_PREFIX + cache,
      key: name
    }
  }, {
    $set: {
      accessed: new Date()
    }
  }).then(function (doc) {
    if (!doc) {
      return null;
    }
    return doc.contents;
  });
};

exports.save = function save(cache, name, contents) {
  // Wrap in a Promise.try, so that any potential synchronous Mongoose
  // exceptions get funneled into the promise.
  return Promise.try(function () {
    return CacheItem.findOneAndUpdateAsync({
      _id: {
        cache: CACHE_NAME_PREFIX + cache,
        key: name
      }
    }, {
      $set: {
        accessed: new Date(),
        contents: contents
      }
    }, {
      upsert: true,
      select: { _id: 1 }
    });
  });
};
