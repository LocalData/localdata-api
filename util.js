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

module.exports = {
  handleError: handleError,
  makeErrorHandler: makeErrorHandler,
  isArray: isArray
}

// Simple route middleware to ensure user is authenticated.
//   Use this route middleware on any resource that needs to be protected.  If
//   the request is authenticated (typically via a persistent login session),
//   the request will proceed.  Otherwise, the user will be redirected to the
//   login page.
function ensureAuthenticated(req, res, next) {
  console.log("Checking if authenticated");
  if (req.isAuthenticated()) { return next(); }
  res.redirect('/static/login.html');
}

