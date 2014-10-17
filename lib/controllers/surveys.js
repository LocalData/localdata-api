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
  var survey;

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
      .catch(function (CancellationError, e) {
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
  var survey;

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


/**
 * Get statistics for a survey
 *
 * Add the comma-separated coordinates of a polygon to limit the
 * stats to a geographic area
 *
 * https://localhost:3001/api/surveys/123/stats
 * https://localhost:3001/api/surveys/123/stats?intersects=[GeoJSON Polygon]
 */
exports.stats = function getStats(req, res) {
  var stats = {
    Collectors: {}
  };
  var count = 0;

  var surveyId = req.params.surveyId;
  var intersects = req.query.intersects;

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
    'properties.survey': surveyId
  };

  // Decode any geospatial limits
  if (intersects !== undefined) {
    decodeURIComponent(intersects);
    var polygon = JSON.parse(intersects);

    query.indexedGeometry = {
      $geoIntersects: {
        $geometry: polygon
      }
    };
  }

  function getChunk(start, done) {
    var length = 5000;
    Response.find(query, 'entries')
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
