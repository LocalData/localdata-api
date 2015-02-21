/*jslint node: true */
'use strict';

var Promise = require('bluebird');

var settings = require('../../settings');

// Default to a no-cache strategy.
var strategy = {
  get: function get() {
    return Promise.resolve(null);
  },
  save: function save() {
    return Promise.resolve(undefined);
  }
};

if (settings.cache === 'mongo') {
  strategy = require('./mongo');
}

exports.get = strategy.get;
exports.save = strategy.save;
