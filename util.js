/*jslint node: true */
'use strict';

/*
 *==================================================
 * Utilities
 *==================================================
 */

// Returns true if we handled an error.
function handleError(err, res) {
  if (err) {
    console.log('Error: ' + err.message);
    res.send(500);
    return true;
  }
  return false;
}

// Use currying to avoid some typing every time we handle an error.
function makeErrorHandler(response) {
  return function(error) { return handleError(error, response); };
}

function isArray(arr) {
  return Object.prototype.toString.call(arr) === '[object Array]';
}

// Parse the paging information from a request's query parameters.
// Returns null if we could not determine paging parameters.
function getPagingParams(request) {
  var startIndex = parseInt(request.query.startIndex, 10);
  var count = parseInt(request.query.count, 10);

  if (isNaN(startIndex) || isNaN(count)) {
    return null;
  }

  return {
    startIndex: startIndex,
    count: count
  };
}

module.exports = {
  handleError: handleError,
  makeErrorHandler: makeErrorHandler,
  isArray: isArray,
  getPagingParams: getPagingParams
}

 
