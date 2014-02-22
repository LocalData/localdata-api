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

util.simplifyCoordinates = (function () {
  /*
   * Adapted from github.com/mourner/simplify-js
   * (c) 2013, Vladimir Agafonkin
   * Simplify.js, a high-performance JS polyline simplification library
   * mourner.github.io/simplify-js
  */

  // square distance between 2 points
  function getSqDist(p1, p2) {
    var dx = p1[0] - p2[0],
        dy = p1[1] - p2[1];

    return dx * dx + dy * dy;
  }

  // square distance from a point to a segment
  function getSqSegDist(p, p1, p2) {
    var x = p1[0],
        y = p1[1],
        dx = p2[0] - x,
        dy = p2[1] - y;

    if (dx !== 0 || dy !== 0) {
      var t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);

      if (t > 1) {
        x = p2[0];
        y = p2[1];
      } else if (t > 0) {
        x += dx * t;
        y += dy * t;
      }
    }

    dx = p[0] - x;
    dy = p[1] - y;

    return dx * dx + dy * dy;
  }
  // rest of the code doesn't care about point format

  // basic distance-based simplification
  function simplifyRadialDist(points, sqTolerance) {
    var prevPoint = points[0],
        newPoints = [prevPoint],
        point,
        i,
        len;

    for (i = 1, len = points.length; i < len; i += 1) {
      point = points[i];

      if (getSqDist(point, prevPoint) > sqTolerance) {
        newPoints.push(point);
        prevPoint = point;
      }
    }

    if (prevPoint !== point) {
      newPoints.push(point);
    }

    return newPoints;
  }

  // simplification using optimized Douglas-Peucker algorithm with recursion elimination
  function simplifyDouglasPeucker(points, sqTolerance) {
    var len = points.length,
        MarkerArray = typeof Uint8Array !== 'undefined' ? Uint8Array : Array,
        markers = new MarkerArray(len),
        first = 0,
        last = len - 1,
        stack = [],
        newPoints = [],
        i, maxSqDist, sqDist, index;

    markers[first] = markers[last] = 1;

    while (last) {
      maxSqDist = 0;

      for (i = first + 1; i < last; i++) {
        sqDist = getSqSegDist(points[i], points[first], points[last]);

        if (sqDist > maxSqDist) {
          index = i;
          maxSqDist = sqDist;
        }
      }

      if (maxSqDist > sqTolerance) {
        markers[index] = 1;
        stack.push(first, index, index, last);
      }

      last = stack.pop();
      first = stack.pop();
    }

    for (i = 0; i < len; i++) {
      if (markers[i]) {
        newPoints.push(points[i]);
      }
    }

    return newPoints;
  }

  // both algorithms combined for awesome performance
  function simplifyPoints(points, tolerance) {
    var sqTolerance = tolerance !== undefined ? tolerance * tolerance : 1;
    points = simplifyRadialDist(points, sqTolerance);
    points = simplifyDouglasPeucker(points, sqTolerance);
    return points;
  }

  function simplify(coordinates, tolerance) {

    function simp(coordinates) {
      if (!util.isArray(coordinates[0][0])) {
        return simplifyPoints(coordinates, tolerance);
      }
      return coordinates.map(simp);
    }
    return simp(coordinates);
  }

  return simplify;
}());
