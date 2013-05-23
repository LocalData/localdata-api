/*jslint node: true */
'use strict';

var async = require('async');
var util = require('../util');
var Org = require('../models/Org');

// List all orgs or list a user's orgs.
exports.list = function list(req, res) {
  var user = req.params.user;

  // See if we are filtering by a user.
  if (user) {
    // We currently only allow users to see their own orgs.
    if (user !== req.user._id) {
      res.send(403);
      return;
    }
    return exports.listForCurrentUser(req, res);
  }

  Org.find({}).exec(function (error, docs) {
    if (util.handleError(error, res)) { return; }
    res.send({ orgs: docs });
  });
};

// List the current user's orgs.
exports.listForCurrentUser = function listForCurrentUser(req, res) {
  Org.find({ users: req.user._id }).select('+users').exec(function (error, docs) {
    if (util.handleError(error, res)) { return; }
    res.send({ orgs: docs });
  });
};

exports.get = function get(req, res) {
  var orgId = req.params.orgId;

  Org.findOne({ _id: orgId }).exec(function (error, org) {
    if (util.handleError(error, res)) { return; }

    if (!org) {
      res.send(404);
      return;
    }
    res.send({ org: org });
  });
};

exports.post = function post(req, res) {
  var data = req.body.orgs;

  async.map(data, function (item, next) {
    item.users = [req.user._id];
    var org = new Org(item);
    org.save(next);
  }, function (error, docs) {
    if (error) {
      if (error.code === 11000) {
        // Mongo duplicate key error
        res.send(400, {
          type: 'OrgExistsError',
          message: 'An organization with that name already exists'
        });
      } else {
        console.log(error);
        res.send(500);
      }
      return;
    }
    res.send(201, { orgs: docs });
  });

};

exports.put = function put(req, res) {
  var orgId = req.params.orgId;
  var org = req.body.org;

  Org.findOne({ _id: orgId }).select('+users').exec(function (error, doc) {
    if (util.handleError(error, res)) { return; }

    // We didn't find an org with that ID.
    if (!doc) {
      res.send(404);
      return;
    }

    // Make sure the user is authorized.
    if (doc.users.indexOf(req.user._id) === -1) {
      res.send(403);
      return;
    }

    Org.findOneAndUpdate({ _id: doc.id }, org).select('+users').exec(function (error, updated) {
      if (util.handleError(error, res)) { return; }
      res.send({ org: updated });
    });
  });
};
