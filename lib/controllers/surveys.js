/*jslint node: true */
'use strict';

var __ = require('lodash');
var async = require('async');

var Response = require('../models/Response');
var Survey = require('../models/Survey');
var util = require('../util');

exports.list = function list(req, res) {
  var query;
  if(req.user) {
    query = {
      users: req.user._id
    };
  }else {
    res.send(401);
    return;
  }

  Survey.find(query)
  .lean()
  .exec(function (error, surveys) {
    if (util.handleError(error, res)) { return; }
    res.send({ surveys: surveys });
  });
};

exports.get = function get(req, res) {
  var surveyId = req.params.surveyId;
  var survey;

  // TODO: We can get the count and bounds in parallel and maybe even roll them
  // into one aggregation pipeline.
  async.waterfall([
    function (next) {
      Survey.findOne({ id: surveyId }).lean().exec(next);
    },
    function (result, next) {
      if (!result) {
        res.send(404);
        return;
      }
      survey = result;
      Response.countEntries({ 'properties.survey': surveyId }, next);
    },
    function (count, next) {
      survey.responseCount = count;
      Response.getBounds(surveyId, next);
    }
  ], function (error, bounds) {
    if (util.handleError(error, res)) { return; }

    survey.responseBounds = bounds;
    res.send({ survey: survey });
  });
};

exports.stats = function getStats(req, res) {
  var stats = {
    Collectors: {}
  };
  var count = 0;

  var surveyId = req.params.surveyId;
  var polygon = req.get('polygon');


  function summer(memo, num) {
    return memo + num;
  }

  function handleDoc(doc) {
    var key,
        val;

    count += 1;

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
    Object.keys(r).forEach(function (key) {
      var val = r[key];
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
    });
  }

  var query = {
    survey: surveyId
  };

  if (polygon !== undefined) {
    var coordinates = [], i, values;
    console.info(polygon);

    // First, we need to get the coordinates into a usable format
    values = polygon.split(',');
    values = _.map(coordinates, parseFloat);

    // Then we need to pack them into lng, lat pairs
    for (i = 0; i < values.length; i += 2) {
      coordinates.push([values[i], values[i+1]]);
    }

    console.info("polygon:", coordinates);

    query.geoWithin = {
      '$geometry': {
        type: 'Polygon',
        coordinates: [coordinates]
      }
    };
  }

  function getChunk(start, done) {
    var length = 5000;
    Response.find({ 'properties.survey': surveyId }, 'entries')
    .skip(start).limit(length)
    .lean()
    .exec(function (error, chunk) {
      if (error) {
        done(error);
        return;
      }

      var i;
      for (i = 0; i < chunk.length; i += 1) {
        handleDoc(chunk[i]);
      }

      if (chunk.length === length) {
        getChunk(start + length, done);
      } else {
        done(null);
      }
    });
  }

  getChunk(0, function (error) {
    if (error) {
      console.log(error);
      console.log(error.stack);
      res.send(500);
      return;
    }

    if (count === 0) {
      // Make sure the survey exists. We don't check beforehand because it
      // saves a query in the most common case.
      Survey.findOne({
        id: surveyId
      })
      .lean()
      .exec(function (error, survey) {
        if (util.handleError(error, res)) { return; }
        if (survey === null) {
          res.send(404);
        } else {
          res.send({
            stats: stats
          });
        }
      });
      return;
    }

    // Calculate "no response" count for each question
    Object.keys(stats).forEach(function (key) {
      var stat = stats[key];
      var sum = __.reduce(stat, summer, 0);
      var remainder = count - sum;

      stats[key]['no response'] = remainder;
    });

    res.send({
      stats: stats
    });

  });
};

exports.post = function post(req, response) {
  var i;
  var data = req.body.surveys;
  var output = [];
  var count = data.length;
  var itemError = null;

  for (i = 0; i < data.length; i++) {
    data[i].users = [req.user._id];
  }

  Survey.create(data, function (error) {
    if (error) {
      itemError = error;
      console.log(error);
      if (error.name === 'ValidationError') {
        response.send(400, error);
      } else {
        response.send(500);
      }
      return;
    }

    var output = Array.prototype.slice.call(arguments, 1).map(function (doc) {
      return doc.toObject();
    });

    var name = req.user.name;
    var link =  'https://' + req.headers.host + '/#surveys/' + output[0].slug;
    console.info('INFO: Survey created. User: ' + name + '; Link: ' + link);
    response.send(201, { surveys: output });
  });
};

exports.put = function put(req, response) {
  var surveyId = req.params.surveyId;
  var survey = req.body.survey;

  // Update the survey, asking MongoDB to return the updated document.
  Survey.findOneAndUpdate({ id: surveyId }, survey, function (error, updated) {
    if (error) {
      console.log(error);
      response.send(500);
      return;
    }

    response.send({ survey: updated.toObject() });
  });
};

// Get the survey ID associated with a slug
// Not authenticated.
exports.getSlug = function getSlug(req, res) {
  Survey.findOne({
    slug: req.params.slug
  })
  .lean()
  .exec(function (error, survey) {
    if (util.handleError(error, res)) { return; }
    if (survey === null) {
      res.send(404);
    } else {
      res.send({ survey: survey.id });
    }
  });
};
