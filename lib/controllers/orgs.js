/*jslint node: true */
'use strict';

var async = require('async');
var util = require('../util');
var Org = require('../models/Org');

// List all orgs or list a user's orgs.
exports.list = function list(req, res) {
  var query;
  var user = req.params.user;

  // See if we are filtering by a user.
  if (user) {
    if (user !== req.user._id) {
      res.send(403);
      return;
    }
    query = Org.where('users', user).select('+users');
  } else {
    query = Org.find({});
  }

  query.exec(function (error, docs) {
    if (util.handleError(error, res)) { return; }
    var orgs = docs.map(function (doc) {
      return doc.toObject();
    });
    res.send({ orgs: orgs });
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
    res.send({ org: org.toObject() });
  });
};

exports.post = function post(req, res) {
  var data = req.body.orgs;

  async.map(data, function (item, next) {
    item.users = [req.user._id];
    var org = new Org(item);
    org.save(next);
  }, function (error, results) {
    if (util.handleError(error, res)) { return; }
    var docs = results.map(function (doc) { return doc.toObject(); });
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
      res.send({ org: updated.toObject() });
    });
  });
};
