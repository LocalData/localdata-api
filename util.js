/*
 *==================================================
 * Utilities
 *==================================================
 */

module.exports = {
  handleError: handleError
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

