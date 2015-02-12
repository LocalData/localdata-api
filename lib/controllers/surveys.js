/*jslint node: true */
'use strict';

var __ = require('lodash');
var async = require('async');
var Promise = require('bluebird');

var Response = require('../models/Response');
var Survey = require('../models/Survey');
var User = require('../models/User');
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

  var countPromise = Promise.promisify(Response.countEntries, Response)({
    'properties.survey': surveyId
  }).cancellable();

  var boundsPromise = Promise.promisify(Response.getBounds, Response)(surveyId).cancellable();

  Promise.resolve(Survey.findOne({ id: surveyId }).lean().exec())
  .then(function (survey) {
    if (!survey) {
      // Cancel the count and bounds promises.
      countPromise.cancel();
      boundsPromise.cancel();
      return Promise.join(countPromise, boundsPromise)
      .then(function () {
        // In case the count or bounds promises resolve before we cancel them.
        res.send(404);
      })
      .catch(Promise.CancellationError, function (e) {
        res.send(404);
      });
    }

    return Promise.join(countPromise, boundsPromise, function (count, bounds) {
      survey.responseCount = count;
      survey.responseBounds = bounds;
      res.send({ survey: survey });
    });
  }).catch(function (error) {
    console.log(error);
    console.log(error.stack);
    res.send(500);
  });
};

// Get all users belonging to a survey
exports.users = function users(req, res) {
  var surveyId = req.params.surveyId;

  // Find the user IDs
  Survey.findOne({ id: surveyId })
        .select('users')
        .lean()
        .exec(function(error, survey) {

    if (util.handleError(error, res)) { return; }

    // Now get the data for each of these users
    User.find({ "_id": { $in: survey.users}})
        .lean()
        .select('name _id email')
        .exec(function(error, users){

      if (util.handleError(error, res)) { return; }
      res.send({ users: users });
    });
  });
};


exports.addUser = function addUser(req, res) {
  var surveyId = req.params.surveyId;
  var email = req.params.email;
  email = email.toLowerCase();

  // Find the survey and user
  async.parallel({
      survey: function(callback){
        Survey.findOne({ id: surveyId }).select('users').exec(function(error, survey){
          callback(error, survey);
        });
      },
      user: function(callback){
        User.findOne({ email: email }, function (error, user) {
          callback(error, user);
        });
      }
  },
  function(error, results) {
    var user = results.user;
    var survey = results.survey;

    if (error) {
      res.send({ name: 'UserQueryError', message: 'We were not able to add the user at this time' }, 500);
      return;
    }
    if(!user) {
      res.send({ name: 'UserNotFoundError', message: 'User not found' }, 400);
      return;
    }

    // Add the user to the survey users
    if(! __.contains(survey.users, user._id)) {
      survey.users.push(user._id.toString());
    }

    // Save the survey
    Survey.update({ id: surveyId}, { users: survey.users}, function(err, doc) {
      if (err) {
        res.send({ name: 'SurveySaveError', message: "We were not able to add the user at this time" }, 500);
        return;
      }
      res.send({ survey: doc });
      return;
    });
  });
};


exports.removeUser = function addUser(req, res) {
  var surveyId = req.params.surveyId;
  var email = req.params.email;
  email = email.toLowerCase();

  // Find the survey and user
  async.parallel({
      survey: function(callback){
        Survey.findOne({ id: surveyId }).select('users').exec(function(error, survey){
          callback(error, survey);
        });
      },
      user: function(callback){
        User.findOne({ email: email }, function (error, user) {
          callback(error, user);
        });
      }
  },
  function(error, results) {
    var user = results.user;
    var survey = results.survey;

    if (error) {
      res.send({ name: 'UserQueryError', message: 'We were not able to add the user at this time' }, 500);
      return;
    }
    if(!user) {
      res.send({ name: 'UserNotFoundError', message: 'User not found' }, 400);
      return;
    }

    // Remove the user ID from the list
    survey.users = __.without(survey.users, user._id.toString());

    //Save the survey
    Survey.update({ id: surveyId }, { users: survey.users }, function(error, success) {
      if (error) {
        res.send({ name: 'SurveySaveError', message: "We were not able to remove the user at this time" }, 500);
        return;
      }
      res.send(204);
      return;
    });
  });
};


exports.post = function post(req, response) {
  var i;
  var data = req.body.surveys;
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
    console.log('info at=surveys event=created user="' + name + '" link="' + link + '"');
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


exports.del = function put(req, response) {
  var surveyId = req.params.surveyId;

  // Update the survey, asking MongoDB to return the updated document.
  Survey.remove({ id: surveyId }, function (error, updated) {
    if (error) {
      console.log(error);
      response.send(500);
      return;
    }

    response.send(204);
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
