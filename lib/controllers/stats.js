/*jslint node: true */
'use strict';

var _ = require('lodash');
var moment = require('moment-range');
var Promise = require('bluebird');

var Response = require('../models/Response');
var Survey = require('../models/Survey');

Promise.promisifyAll(Survey);
Promise.promisifyAll(Response.collection);

var MAX_ENTRIES = 250;
var DAILY = 'daily';
var MONTHLY = 'monthly';
var MONTHS = [1,2,3,4,5,6,7,8,9,10,11,12];

/**
 * Get statistics for a survey
 *
 * Add the comma-separated coordinates of a polygon to limit the
 * stats to a geographic area.
 *
 * Query parameters:
 * 'after' -- date in milliseconds since jan 1 1970 (eg 1401628391446)
 * 'intersects' -- geojson polygon, ex { type: "Polygon", coordinates: [[x,y], ...] }
 * 'until' -- date in milliseconds since jan 1 1970 (eg 1401628391446)
 *
 * GET /api/surveys/123/stats
 * GET /api/surveys/123/stats?intersects=[GeoJSON Polygon]
 * GET /api/surveys/123/stats?until=date
 */
exports.stats = function stats(req, res) {
  var surveyId = req.params.surveyId;
  var intersects = req.query.intersects;
  var after = req.query.after;
  var until = req.query.until;

  function summer(memo, num) {
    return memo + num;
  }

  var conditions = {
    'properties.survey': surveyId
  };

  // Date filters
  if (until || after) {
    conditions['entries.created'] = {};

    if (until) {
      until = new Date(parseInt(until, 10));
      conditions['entries.created'].$lte = new Date(until);
    }

    if (after) {
      after = new Date(parseInt(after, 10));
      conditions['entries.created'].$gt = new Date(after);
    }
  }

  // Decode any geospatial limits
  if (intersects !== undefined) {
    decodeURIComponent(intersects);
    var polygon = JSON.parse(intersects);

    conditions.indexedGeometry = {
      $geoIntersects: {
        $geometry: polygon
      }
    };
  }

  function reduce(doc, memo) {
    var key,
        val;
     var stats = memo.stats;

    memo.count += 1;

    var index = doc.entries.length - 1;
    var entry = doc.entries[index];

    // If the latest entry has no responses, then find the most recent entry
    // that has data.
    while (!entry.responses) {
      index -= 1;
      // If there are no responses at all, then we do nothing with this doc.
      if (index < 0) {
        return;
      }
      entry = doc.entries[index];
    }

    // Record the collector
    key = entry.source.collector;
    val = stats.Collectors[key];
    if (val !== undefined) {
      val += 1;
    } else {
      val = 1;
    }
    stats.Collectors[key] = val;

    // Count the answers
    var r = entry.responses;
    var keys = Object.keys(r);
    var i;
    var len;
    for (i = 0, len = keys.length; i < len; i += 1) {
      key = keys[i];
      val = r[key];
      var question = stats[key];
      if (question === undefined) {
        question = stats[key] = {};
        question[val] = 1;
      } else {
        var tally = question[val];
        if (tally === undefined) {
          tally = 1;
        } else {
          tally += 1;
        }
        question[val] = tally;
      }
    }
  }

  Response.collection.groupAsync({}, conditions, {
    stats: { Collectors: {} },
    count: 0
  }, reduce)
  .then(function (doc) {
    if (!doc || doc.length === 0) {
      // Make sure the survey exists. We don't check beforehand because it
      // saves a query in the most common case.
      return Promise.resolve(Survey.findOne({
        id: surveyId
      })
      .lean()
      .exec()).then(function (survey) {
        if (survey === null) {
          res.send(404);
        } else {
          res.send({
            stats: { Collectors: {} }
          });
        }
      });
    }

    var stats = doc[0].stats;
    var count = doc[0].count;
    // Calculate "no response" count for each question
    _.forEach(_.keys(stats), function (key) {
      var stat = stats[key];
      var sum = _.reduce(stat, summer, 0);
      var remainder = count - sum;

      stats[key]['no response'] = remainder;
    });

    res.send({
      stats: stats
    });
  }).catch(function (error) {
    console.log(error);
    res.send(500);
  });
};

/**
 * Get activity over time for a survey
 *
 * Query parameters:
 * 'after' -- date in milliseconds since jan 1 1970 (eg 1401628391446)
 * 'until' -- date in milliseconds since jan 1 1970 (eg 1401628391446)
 * 'resolution' -- width of each bucket (milliseconds)
 * 'intersects' -- geojson polygon, ex { type: "Polygon", coordinates: [[x,y], ...] }
 * 'collector' -- only report activity for a particular collector (case insensitive)
 *
 * after, until, and resolution are all required unless all three are absent, in which case we assume:
 *   after = now - 24*60*60*1000 (24 hours ago)
 *   until = now
 *   resolution = 6*60*1000 (1/10th of an hour)
 *
 * (until - after)/resolution must be less than 250
 *
 * GET /api/surveys/123/stats
 * GET /api/surveys/123/stats?intersects=[GeoJSON Polygon]
 * GET /api/surveys/123/stats?until=date
 */
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
        message: 'Range:resolution ratio is too high. Must be under ' + MAX_ENTRIES
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




exports.daily = function activity(req, res) {
  var surveyId = req.params.surveyId;
  var range = req.params.range;

  var intersects = req.query.intersects;
  var after = req.query.after;
  var until = req.query.until;
  var collector = req.query.collector;

  var conditions = {
    'properties.survey': surveyId
  };

  var entryProjection = {
    _id: 0,
    created: '$entries.created'
  };

  // Count entries per day with this group and sort
  var dayGroup = { $group: {
      _id: { day: { $dayOfMonth: '$created'}, month: {$month: '$created'},  year: { $year: '$created'} },
      count: { $sum:1 }
    }
  };
  var daySort = { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 }};

  // Count entries per month with this group and sort
  var monthGroup = { $group: {
      _id: { month: {$month: '$created'},  year: { $year: '$created'} },
      count: { $sum:1 }
    }
  };
  var monthSort = { $sort: { '_id.year': 1, '_id.month': 1 }};

  // Decide which sort to use based on the query parameter
  var group, sort;
  if (range === MONTHLY) {
    group = monthGroup;
    sort = monthSort;
  } else if (range === DAILY) {
    group = dayGroup;
    sort = daySort  ;
  }

  // Build up the aggregation
  Promise.resolve(Response.aggregate([
    { $match: conditions },
    { $sort: { 'entries.created': 1 } },
    { $unwind: '$entries' },
    { $project: entryProjection },
    group,
    sort
  ]).exec())
  .then(function (docs) {
    console.log("GOT DOCS", docs);
    var activity = [];

    // Get the start and end dates
    var start = moment({
      years: docs[0]._id.year,
      months: docs[0]._id.month - 1
    });
    var end = moment({
      years: docs[docs.length - 1]._id.year,
      months: docs[docs.length - 1]._id.month - 1
    });

    // Create a range from those dates
    var range = moment().range(start, end);

    // Set up months with null values
    range.by('months', function(moment) {
      activity.push({
        date: {
          year: moment.format('YYYY'),
          month: moment.format('MM')
        },
        count: 0
      });
    });

    // Add in the data
    var monthIdx = 0;
    var dataIdx = 0;
    var datapoint = docs[dataIdx];
    _.each(activity, function(a, idx) {
      var month = datapoint._id.month.toString();

      // Ugh, Mongo doesn't zero-pad months, so we have to do that here.
      if(month.length === 1) {
        month = '0' + month;
      }

      var year = datapoint._id.year.toString();
      if (month === a.date.month && year === a.date.year) {
        activity[idx].count = datapoint.count;
        dataIdx++;
        datapoint = docs[dataIdx];
      }
    });

    var data = {
      stats: {
        activity: activity,

        // We also include the total to make it easy to calculate percentages
        total: _.reduce(docs, function (memo, item) {
          return memo + item.count;
        }, 0)
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
