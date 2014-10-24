/*jslint node: true */
'use strict';

// XXX
var _ = require('lodash');
var Promise = require('bluebird');

var Response = require('../models/Response');
// XXX
//var Survey = require('../models/Survey');

// XXX Require after, until, and resolution. Only service requests where the combination would yield at most some cutoff number of data points.
exports.activity = function activity(req, res) {
  var surveyId = req.params.surveyId;
  var intersects = req.query.intersects;
  var after = req.query.after;
  var until = req.query.until;
  var resolution = req.query.resolution;

  var clientError;
  if (after === undefined && until === undefined && resolution === undefined) {
    // If none of the parameters were specified, then we provide the last 24
    // hours of data at 6-minute resolution.

    after = new Date();
    after.setFullYear(after.getFullYear() - 1);
    until = new Date();
    resolution = 6 * 60 * 1000; // 6 minutes
  } else if (after === undefined || until === undefined || resolution === undefined) {
    // If one of the time/resolution parameters has been provided, we require
    // all of them.
    clientError = {
      name: 'QueryError',
      message: 'If you specify after, until, or resolution parameters, you cannot omit the others'
    };
  } else {
    // Parse the parameters
    after = parseInt(after, 10);
    until = parseInt(until, 10);
    resolution = parseInt(resolution, 10);

    // Confirm that we got valid integers
    if (isNaN(after)) {
      clientError = {
        name: 'QueryError',
        message: 'Invalid value for "after"'
      };
    } else if (isNaN(until)) {
      clientError = {
        name: 'QueryError',
        message: 'Invalid value for "until"'
      };
    } else if (isNaN(resolution)) {
      clientError = {
        name: 'QueryError',
        message: 'Invalid value for "resolution"'
      };
    }

    after = new Date(after);
    until = new Date(until);
  }

  if (clientError) {
    res.send(400, clientError);
    return;
  }

  var conditions = {
    'properties.survey': surveyId
  };

  // Date filters
  conditions['entries.created'] = {
    $gt: after,
    $lte: until
  };

  // Decode any geospatial limits
  if (intersects !== undefined) {
    decodeURIComponent(intersects);
    var polygon;
    try {
      polygon = JSON.parse(intersects);
    } catch (e) {
      res.send(400, {
        name: 'QueryError',
        message: 'Invalid encoded GeoJSON value for "intersects"'
      });
    }

    conditions.indexedGeometry = {
      $geoIntersects: {
        $geometry: polygon
      }
    };
  }

  Promise.resolve(Response.aggregate([
    { $match: conditions },
    { $sort: { 'entries.created': 1 } },
    { $unwind: '$entries' },
    { $match: {
      'entries.created': {
        $gt: after,
        $lte: until
      }
    } },
    { $project: {
      _id: 0,
      ts: {
        $multiply : [
          resolution,
          { $subtract: [
            { $divide: [{ $subtract: ['$entries.created', new Date(0)] }, resolution] },
            { $mod: [
              { $divide: [{ $subtract: ['$entries.created', new Date(0)] }, resolution] },
              1
            ] }
          ] }
        ]
      }
    } },
    { $group: {
      _id: '$ts',
      count: { $sum: 1}
    }},
    { $project: {
      _id: 0,
      ts: '$_id',
      count: 1
    } }
  ]).exec())
  .then(function (docs) {
    // TODO: If there's no activity, then make sure the survey exists, otherwise return 404.
    res.send(200, {
      stats: {
        activity: docs,
        total: _.reduce(docs, function (memo, item) {
          return memo + item.count;
        }, 0)
      }
    });
  }).catch(function (error) {
    console.log('error at=stats issue=mongoose_aggregate_error');
    console.log(error);
    res.send(500);
  });
};
