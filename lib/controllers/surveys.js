/*jslint node: true */
'use strict';

var util = require('../util');
var Survey = require('../models/Survey');
var Response = require('../models/Response');
var __ = require('lodash');

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

  Survey.findOne({
    id: surveyId
  })
  .lean()
  .exec(function (error, survey) {
    if (util.handleError(error, res)) { return; }
    if (survey === null) {
      res.send(404);
    } else {
      Response.count({ survey: surveyId }).exec(function (error, count) {
        if (util.handleError(error, res)) { return; }
        survey.responseCount = count;
        Response.getBounds(surveyId, function (error, bounds) {
          if (util.handleError(error, res)) { return; }

          survey.responseBounds = bounds;
          res.send({ survey: survey });
        });
      });
    }
  });
};

exports.stats = function getStats(req, res) {
  var stats = {
    collectors: {}
  };
  var processed = {};
  var count = 0;

  var surveyId = req.params.surveyId;

  function summer(memo, num) {
    return memo + num;
  }

  function handleDoc(doc) {
    var key,
        val;

    // Check if we've already processed an object with this id
    if(processed[doc.object_id] !== undefined) {
      return;
    }
    processed[doc.object_id] = true;
    count += 1;

    // Record the collector
    key = doc.source.collector;
    val = stats.collectors[key];
    if (val !== undefined) {
      val += 1;
    } else {
      val = 1;
    }
    stats.collectors[key] = val;

    // Count the answers
    var r = doc.responses;
    __.each(r, function (val, key) {
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

  function getChunk(start, done) {
    var length = 5000;
    Response.find({ survey: surveyId })
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
    __.each(stats, function (stat, key) {
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
      if (error.name === 'ValidationError') {
        console.log(error);
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
