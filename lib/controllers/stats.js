/*jslint node: true */
'use strict';

var _ = require('lodash');
var Promise = require('bluebird');

var Response = require('../models/Response');
var Survey = require('../models/Survey');

Promise.promisifyAll(Survey);

var MAX_ENTRIES = 250;

// XXX Only service requests where the combination would yield at most some cutoff number of data points.
exports.activity = function activity(req, res) {
  var surveyId = req.params.surveyId;
  var intersects = req.query.intersects;
  var after = req.query.after;
  var until = req.query.until;
  var resolution = req.query.resolution;
  var collector = req.query.collector;

  var clientError;
  if (after === undefined && until === undefined && resolution === undefined) {
    // If none of the parameters were specified, then we provide the last 24
    // hours of data at 6-minute resolution.

    until = new Date();
    after = new Date(until.getTime() - 24 * 60 * 60 * 1000);
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

    // Confirm that the range/resolution is not too large
    if ((until - after) / resolution > MAX_ENTRIES) {
      clientError = {
        name: 'QueryError',
        message: 'Range:resolution ratio is too high'
      };
    }

    after = new Date(after);
    until = new Date(until);
  }

  if (clientError) {
    res.send(400, clientError);
    return;
  }

  if (collector) {
    collector = collector.toLowerCase();
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
      return;
    }

    conditions.indexedGeometry = {
      $geoIntersects: {
        $geometry: polygon
      }
    };
  }

  var entryProjection = {
    _id: 0,
    created: '$entries.created'
  };

  var entryConditions = {};
  entryConditions.created = conditions['entries.created'];

  if (collector) {
    entryProjection.collector = {
      $toLower: '$entries.source.collector'
    };
    entryConditions.collector = collector;
  }

  Promise.resolve(Response.aggregate([
    { $match: conditions },
    { $sort: { 'entries.created': 1 } },
    { $unwind: '$entries' },
    { $project: entryProjection },
    { $match: entryConditions },
    { $project: {
      _id: 0,
      ts: {
        $multiply : [
          resolution,
          { $subtract: [
            { $divide: [{ $subtract: ['$created', new Date(0)] }, resolution] },
            { $mod: [
              { $divide: [{ $subtract: ['$created', new Date(0)] }, resolution] },
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
    } },
    { $sort: {
      ts: 1
    } }
  ]).exec())
  .then(function (docs) {
    var data = {
      stats: {
        activity: docs,
        total: _.reduce(docs, function (memo, item) {
          return memo + item.count;
        }, 0),
        resolution: resolution
      }
    };

    // If there's no activity, then make sure the survey exists, otherwise
    // return 404.
    if (docs.length === 0) {
      return Survey.countAsync({ id: surveyId })
      .then(function (count) {
        if (count === 0) {
          res.send(404);
        } else {
          res.send(200, data);
        }
      });
    }

    res.send(200, data);
  }).catch(function (error) {
    console.log('error at=stats issue=mongoose_aggregate_error');
    console.log(error);
    res.send(500);
  });
};
