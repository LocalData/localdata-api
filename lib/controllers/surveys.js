/*jslint node: true */
'use strict';

var util = require('../util');
var Survey = require('../models/Survey');

exports.list = function list(req, res) {
  Survey.find({})
  .lean()
  .exec(function (error, surveys) {
    if (util.handleError(error)) { return; }
    res.send({ surveys: surveys });
  });
};

exports.get = function get(req, res) {
  Survey.findOne({
    id: req.params.surveyId
  })
  .lean()
  .exec(function (error, survey) {
    if (util.handleError(error)) { return; }
    if (survey === null) {
      res.send(404);
    } else {
      res.send({ survey: survey });
    }
  });
};

exports.post = function post(req, response) {
  var data = req.body.surveys;
  var output = [];
  var count = data.length;
  var itemError = null;

  data.forEach(function (item) {
    // If we encountered an error saving one of the items, then we've already
    // returned an error status, so let's not try to save remaining items.
    if (itemError !== null) {
      return;
    }

    var survey = new Survey({
      name: item.name,
      paperinfo: item.paperinfo,
      zones: item.zones,
      // The user creating this survey has permission by default.
      users: [req.user._id]
    });

    survey.save(function (error, doc) {
      if (error) {
        itemError = error;
        if (error.name === 'ValidationError') {
          response.send(400, error);
        } else {
          response.send(500);
        }
        return;
      }

      output.push(doc.toObject());
      count -= 1;

      if (count === 0) {
        response.send(201, { surveys: output });
      }
    });

  });
};

exports.put = function put(req, response) {
  // XXX
  response.send(501);
};
