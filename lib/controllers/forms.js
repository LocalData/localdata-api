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

  // FIXME: We need to support listing paper forms for a specific base object ID.

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

function saveEach(items, before, done) {
  // FIXME: assume before is synchronous
  var output = [];
  var itemError = null;

  function saveItem(item, next) {
    before(item, function (error, model) {
      if (error) {
        return next(error);
      }

      model.save(function (error, doc) {
        if (error) {
          return next(error);
        }

        output.push(doc.toObject());
        next(null, output);
      });
    });
  }

  // Create a save function for each item that bails early on error.
  // Maps function (item, next) -> function (error, next)
  var saveArray = items.map(function (item) {
    return function (error, next) {
      if (error) {
        return done(error);
      }
      return saveItem(item, next);
    };
  });

  var chainedSaves = saveArray.reduceRight(function (memo, f, index) {
    return function (err) {
      f(err, memo);
    };
  }, function (e) { done(e); });

  chainedSaves();
}

// Add a set of forms to a survey.
exports.post = function post(req, res) {
  var data = req.body.forms;
  var surveyId = req.params.surveyId;
  var output = [];
  var count = data.length;
  var itemError = null;

  saveEach(data, function before(item, next) {
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
      var error = {
        type: 'SyntaxError',
        message: 'Unsupported form type'
      };
      res.send(400, error);
      return next(error);
    }

    var form = new Form(formData);
    next(null, form);
  }, function done(error, output) {
    if (error) {
      res.send(500);
      return;
    }
    res.send({ forms: output });
  });

  //data.forEach(function (item) {
  //  // If we encountered an error saving one of the items, then we've already
  //  // returned an error status, so let's not try to save remaining items.
  //  if (itemError !== null) {
  //    return;
  //  }

  //  var formData = {
  //    survey: surveyId,
  //    type: item.type
  //  };

  //  if (item.type === 'mobile') {
  //    formData.questions = item.questions;
  //  } else if (item.type === 'paper') {
  //    formData.global = item.global;
  //    formData.parcels = item.parcels;
  //  } else {
  //    res.send(400, {
  //      type: 'SyntaxError',
  //      message: 'Unsupported form type'
  //    });
  //  }

  //  var form = new Form(formData);

  //  form.save(function (error, doc) {
  //    if (error) {
  //      itemError = error;
  //      res.send(500);
  //      return;
  //    }

  //    output.push(doc.toObject());
  //    count -= 1;

  //    if (count === 0) {
  //      res.send({ forms: output });
  //    }
  //  });

  //});
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
        type: 'SyntaxError',
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
