/*jslint node: true */
'use strict';

/*
 *==================================================
 * Utilities
 *==================================================
 */

var _ = require('lodash');
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

function computeRingCentroid(ring) {
  var off = ring[0];
  var twiceArea = 0;
  var x = 0;
  var y = 0;
  var nPoints = ring.length;
  var p1, p2;
  var f;

  var i, j;
  for (i = 0, j = nPoints - 1; i < nPoints; j = i, i += 1) {
    p1 = ring[i];
    p2 = ring[j];
    f = (p1[1] - off[1]) * (p2[0] - off[0]) - (p2[1] - off[1]) * (p1[0] - off[0]);
    twiceArea += f;
    y += (p1[1] + p2[1] - 2 * off[1]) * f;
    x += (p1[0] + p2[0] - 2 * off[0]) * f;
  }
  f = twiceArea * 3;

  // If the area is zero, then we have a simple line segment. Find the
  // endpoints (in case we have more than 2 points arranged in a straight line)
  // and calculate the midpoint.
  if (f === 0) {
    var xmin = Number.POSITIVE_INFINITY;
    var xmax = Number.NEGATIVE_INFINITY;
    var ymin = Number.POSITIVE_INFINITY;
    var ymax = Number.NEGATIVE_INFINITY;
    for (i = 0; i < nPoints; i += 1) {
      xmin = Math.min(xmin, ring[i][0]);
      xmax = Math.max(xmax, ring[i][0]);
      ymin = Math.min(ymin, ring[i][1]);
      ymax = Math.max(ymax, ring[i][1]);
    }
    return [(xmax + xmin) / 2, (ymax + ymin) / 2];
  }

  return [x / f + off[0], y / f + off[1]];
}

// Compute the centroid of a geometry.
util.computeCentroid =  function computeCentroid(geometry) {
  var ring;
  if (geometry.type === 'MultiPolygon') {
    // TODO: For now we only handle the first polygon.
    return computeRingCentroid(geometry.coordinates[0][0]);
  }

  if (geometry.type === 'Polygon') {
    // TODO: For now we only handle the exterior ring.
    return computeRingCentroid(geometry.coordinates[0]);
  }

  if (geometry.type === 'MultiLineString') {
    // TODO: For now we only handle the first linestring.
    ring = geometry.coordinates[0].concat([geometry.coordinates[0][0]]);
    return computeRingCentroid(ring);
  }

  if (geometry.type === 'LineString') {
    // TODO: For now we only handle the exterior ring.
    ring = geometry.coordinates.concat([geometry.coordinates[0]]);
    return computeRingCentroid(ring);
  }

  if (geometry.type === 'Point') {
    return _.clone(geometry.coordinates);
  }

  // TODO: we should handle MultiPoint and GeometryCollection
  return null;
};

function rearrangePoints(center, points) {
  return _.sortBy(points, function (point) {
    var vector = [point[0] - center[0], point[1] - center[1]];
    return -1 * Math.atan2(vector[1], vector[0]);
  });
}

// Rearrange coordinates so that they run clockwise around the centroid.
util.rearrangeCoordinates = function rearrangeCoordinates(geometry) {
  var centroid = util.computeCentroid(geometry);
  var coords;

  if (geometry.type === 'LineString') {
    return {
      type: geometry.type,
      coordinates: rearrangePoints(centroid, geometry.coordinates)
    };
  }

  if (geometry.type === 'Polygon') {
    coords = rearrangePoints(centroid, geometry.coordinates[0].slice(0,-1));
    coords.push(coords[0]);
    return {
      type: geometry.type,
      coordinates: [coords]
    };
  }

  // We only use this on LineStrings and Polygons right now. Implementing
  // MultiPolygon, etc. should not be difficult.
  return null;
};

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

  function simplify(geometry, tolerance) {
    var coords = geometry.coordinates;

    function simp(coordinates) {
      if (!util.isArray(coordinates[0][0])) {
        return simplifyPoints(coordinates, tolerance);
      }
      return coordinates.map(simp);
    }

    coords = simp(coords);

    return {
      type: geometry.type,
      coordinates: coords
    };
  }

  return simplify;
}());
