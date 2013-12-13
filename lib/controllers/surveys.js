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

exports.stats = function stats(req, res) {
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

      Response.find({ survey: surveyId })
              .sort('-created')
              .exec(function(error, responses) {

        var stats = {
          collectors: {}
        };
        var processed = {};
        var i,
            key,
            val;

        for (i = 0; i < responses.length; i++) {
          var r = responses[i];
          var id = r.object_id;

          // Check if we've already processed an object with this id
          if(__.has(processed, id)) {
            continue;
          }
          processed[id] = true;

          // Record the collector
          key = r.source.collector;
          val = stats.collectors[key];
          if(val !== undefined) {
            val += 1;
          } else {
            val = 1;
          }
          stats.collectors[key] = val;

          // Record the responses
          var statsVal;
          r = responses[i].responses;
          for (key in r) {
            if (r.hasOwnProperty(key)) {
              val = r[key];

              if(__.has(stats, key)) {
                statsVal = stats[key][val];
                if(statsVal !== undefined){
                  statsVal += 1;
                }else {
                  statsVal = 1;
                }
                stats[key][val] = statsVal;
              }else {
                stats[key] = {};
                stats[key][val] = 1;
              }
            }
          }
        }

        // Calculate "no answer" responses
        var summer = function(memo, num) {
          return memo + num;
        };

        for (key in stats) {
          if(stats.hasOwnProperty(key)) {
            var sum = __.reduce(stats[key], summer, 0);
            var remainder = responses.length - sum;

            stats[key]['no response'] = remainder;
          }
        }

        res.send({
          stats: stats
        });

      });
    }
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
