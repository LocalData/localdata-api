/*
 *==================================================
 * Utilities
 *==================================================
 */

module.exports = {
  handleError: handleError,
  makeErrorHandler: makeErrorHandler
}

// Returns true if we handled an error.
function handleError(err, res) {
  if (err != null) {
    console.log('Error: ' + err.message);
    res.send();
    return true;
  }
  return false;
}

// Use currying to avoid some typing every time we handle an error.
function makeErrorHandler(response) {
  return function(error) { return handleError(error, response); }
}

