/*jslint node: true */
'use strict';

var util = require('../util');
var Form = require('../models/Form');

// List all forms for a survey.
exports.list = function list(req, res) {
  // Allow ascending or descending order according to creation time
  var sort = req.query.sort;
  if (sort !== 'asc') {
    sort = 'desc';
  }

  var conditions = {
    survey: req.params.surveyId
  };

  if (req.query.hasOwnProperty('parcel')) {
    conditions['parcels.parcel_id'] = req.query.parcel;
  }

  var query = Form.find(conditions);

  query.sort({ created: sort });

  query.lean()
  .exec(function (error, forms) {
    if (util.handleError(error, res)) { return; }
    res.send({ forms: forms });
  });
};

// Get one form by survey ID and form ID.
exports.get = function get(req, res) {
  Form.findOne({
    survey: req.params.surveyId,
    id: req.params.formId
  })
  .lean()
  .exec(function (error, form) {
    if (util.handleError(error)) { return; }
    if (form === null) {
      res.send(404);
    } else {
      res.send({ form: form });
    }
  });
};

// Add a set of forms to a survey.
exports.post = function post(req, res) {
  var data = req.body.forms;
  var surveyId = req.params.surveyId;
  var output = [];
  var count = data.length;
  var itemError = null;

  var errors = [];

  var rawForms = data.map(function (item) {
    if (errors.length > 0) {
      return null;
    }

    var formData = {
      survey: surveyId,
      type: item.type
    };

    if (item.type === 'mobile') {
      formData.questions = item.questions;
    } else if (item.type === 'paper') {
      formData.global = item.global;
      formData.parcels = item.parcels;
    } else {
      errors.push({
        name: 'SyntaxError',
        message: 'Unsupported form type'
      });
    }

    return formData;
  });

  if (errors.length > 0) {
    res.send(400, errors[0]);
    return;
  }

  Form.create(rawForms, function (error) {
    if (error) {
      res.send(500);
      return;
    }
    var output = Array.prototype.slice.call(arguments, 1).map(function (doc) {
      return doc.toObject();
    });
    res.send(201, { forms: output });
  });
};

// Modify an existing form.
exports.put = function put(req, res) {
  var modifiedForm = req.body.form;

  Form.findOne({
    survey: req.params.surveyId,
    id: req.params.formId
  })
  .exec(function (error, form) {
    if (util.handleError(error)) { return; }
    if (form === null) {
      res.send(404);
    } else if (form.type !== modifiedForm.type) {
      res.send(400, {
        name: 'SyntaxError',
        message: 'You cannot change the form type'
      });
    } else {
      form.created = new Date();
      if (form.type === 'mobile') {
        form.questions = modifiedForm.questions;
        form.markModified('questions');
      } else if (form.type === 'paper') {
        form.global = modifiedForm.global;
        form.markModified('global');
        form.parcels = modifiedForm.parcels;
        form.markModified('parcels');
      }

      form.save(function (error, doc) {
        if (error) {
          res.send(500);
          return;
        }

        res.send({ form: doc });
      });
    }
  });
};
