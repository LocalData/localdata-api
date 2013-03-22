/*jslint node: true */
'use strict';

/*
 *==================================================
 * Utilities
 *==================================================
 */

var uuid = require('node-uuid');
var _ = require('lodash');
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

function sec(x) { return 1 / Math.cos(x); }

function coordsToTiles(zoom, coords) {
  var n = Math.pow(2, zoom);
  var lon_rad = coords[0] * Math.PI / 180;
  var lat_rad = coords[1] * Math.PI / 180;
  var xtile = n * (1 + (lon_rad / Math.PI)) / 2;
  var ytile = n * (1 - (Math.log(Math.tan(lat_rad) + sec(lat_rad)) / Math.PI)) / 2;
  return [Math.floor(xtile), Math.floor(ytile)];
}

util.getTilesForBbox = function getTilesForBbox(zoom, bbox) {
  var tileBBox = [coordsToTiles(zoom, bbox[0]), coordsToTiles(zoom, bbox[1])];
  var tileCoords = [];
  var xrange;
  var yrange;

  if (tileBBox[0][0] <= tileBBox[1][0]) {
    xrange = _.range(tileBBox[0][0], tileBBox[1][0] + 1);
  } else {
    xrange = _.range(tileBBox[0][0], tileBBox[1][0] + 1, -1);
  }

  if (tileBBox[0][1] <= tileBBox[1][1]) {
    yrange = _.range(tileBBox[0][1], tileBBox[1][1] + 1);
  } else {
    yrange = _.range(tileBBox[0][1], tileBBox[1][1] - 1, -1);
  }

  _.each(xrange, function (x) {
    _.each(yrange, function (y) {
      tileCoords.push([zoom, x, y]);
    });
  });

  return tileCoords;
};

util.getBbox = function getBbox(points) {
  var ll_x = Number.POSITIVE_INFINITY;
  var ll_y = Number.POSITIVE_INFINITY;
  var ur_x = Number.NEGATIVE_INFINITY;
  var ur_y = Number.NEGATIVE_INFINITY;
  var i;

  for (i = 0; i < points.length; i += 1) {
    var point = points[i];
    if (point[0] < ll_x) {
      ll_x = point[0];
    }
    if (point[0] > ur_x) {
      ur_x = point[0];
    }
    if (point[1] < ll_y) {
      ll_y = point[1];
    }
    if (point[1] > ur_y) {
      ur_y = point[1];
    }
  }

  return [[ll_x, ll_y], [ur_x, ur_y]];
};
