/*jslint node: true */
'use strict';

/*
 *==================================================
 * Utilities
 *==================================================
 */

var uuid = require('node-uuid');
var util = require('util');
module.exports = util;

// Returns true if we handled an error.
util.handleError = function handleError(err, res) {
  if (err) {
    console.log('Error: ' + err.message);
    res.send(500);
    return true;
  }
  return false;
};

// Use currying to avoid some typing every time we handle an error.
util.makeErrorHandler = function makeErrorHandler(response) {
  return function(error) { return util.handleError(error, response); };
};

// Parse the paging information from a request's query parameters.
// Returns null if we could not determine paging parameters.
util.getPagingParams = function getPagingParams(request) {
  var startIndex = parseInt(request.query.startIndex, 10);
  var count = parseInt(request.query.count, 10);

  if (isNaN(startIndex) || isNaN(count)) {
    return null;
  }

  return {
    startIndex: startIndex,
    count: count
  };
};

util.uuidv1 = uuid.v1;
