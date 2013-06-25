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
        res.send({ survey: survey });
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

      Response.find({ survey: surveyId }, function(error, responses){

        var stats = {};
        // We should probably create a simpler structure for this.
        // For now, it looks like this:
        // {
        //  question: {
        //    answer: count,
        //    answer: count
        //    ...
        //  }, ...
        // }
        for (var i = 0; i < responses.length; i++) {
          var r = responses[i].responses;

          for (var key in r) {
            if (__.has(r, key)) {
              var val = r[key];

              if(__.has(stats, key)) {
                if(__.has(stats[key], r[key])){
                  stats[key][val] += 1;
                }else {
                  stats[key][val] = 1;
                }
              }else {
                stats[key] = {};
                stats[key][val] = 1;
              }
            }
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
  var data = req.body.surveys;
  var output = [];
  var count = data.length;
  var itemError = null;

  for (var i = 0; i < data.length; i++) {
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
    response.send(201, { surveys: output });
  });
};

exports.put = function put(req, response) {
  var surveyId = req.params.surveyId;
  var survey = req.body.survey;

  // Retrieve the valid users, which are not selected by default.
  Survey.findOne({ id: surveyId }, 'users', function (error, doc) {
    if (error) {
      console.log(error);
      response.send(500);
      return;
    }

    // No such survey found.
    if (doc === null) {
      response.send(404);
      return;
    }

    // If the current user doesn't own the survey, we can't save it.
    if (doc.users.indexOf(req.user._id) === -1) {
      response.send(403);
      return;
    }

    // Update the survey, asking MongoDB to return the updated document.
    Survey.findOneAndUpdate({ id: surveyId }, survey, function (error, updated) {
      if (error) {
        console.log(error);
        response.send(500);
        return;
      }

      response.send({ survey: updated.toObject() });
    });
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
