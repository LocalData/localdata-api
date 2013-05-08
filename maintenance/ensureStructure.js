/*jslint node: true */

/*
 * Maintenance script to ensure indexes and other structure
 * 
 * Usage:
 * $ node ensureStructure.js
 * $ node ensureStructure.js settings-file.js
 *
 */
'use strict';

var makeSlug = require('slugs');
var mongoose = require('mongoose');

var Form = require('../lib/models/Form');
var Response = require('../lib/models/Response');
var Survey = require('../lib/models/Survey');
var User = require('../lib/models/User');

var settings;
if (process.argv.length > 2) {
  settings = require(process.cwd() + '/' + process.argv[2]);
} else {
  settings = require('../settings-test.js');
}

// Names of the MongoDB collections we use
var USERS = 'usersCollection';
var RESPONSES = 'responseCollection';
var FORMS = 'formCollection';
var SURVEYS = 'surveyCollection';

// Make sure an item has a unique slug
function checkSlug(name, index, done) {
  var slug = makeSlug(name);
  if (index > 0) {
    slug = slug + '-' + index;
  }

  // See if we've already used this slug.
  // If we have, try another slug.
  Survey.count({ slug: slug }, function (err, count) {
    if (err) { return done(err); }

    if (count > 0) {
      checkSlug(name, index + 1, done);
    } else {
      done(null, slug);
    }
  });
}

// Ensure certain database structure
function ensureStructure(db, callback) {
  // Map f(callback) to f(error, callback)
  // If we encounter an error, bail early with the callback.
  function upgrade(g) {
    return function (err, done) {
      if (err) { done(err); }
      g(done);
    };
  }

  // Chain async function calls
  function chain(arr, done) {
    return arr.reduceRight(function (memo, f, index) {
      return function (err) {
        upgrade(f)(err, memo);
      };
    }, function (e) { done(e); });
  }

  // Make sure our collections are in good working order.
  // This primarily means making sure indexes are set up.

  function ensureSlugs(done) {
    Survey.find({}).lean().exec(function (error, docs) {
      // Reject if there's an error
      if (error) {
        return done(error);
      }

      // Look for surveys with no slug
      // There are no surveys yet, so there's nothing to do.
      if (docs.length === 0) {
        return done(null);
      }

      var count = 0;

      docs.forEach(function (item) {
        // Add a slug if there isn't one
        if (item.slug === undefined) {
          checkSlug(item.name, 0, function (error, slug) {
            if (error) { return done(error); }

            // Update entry
            Survey.udpate({ _id: item._id }, { '$set': { slug: slug } }, function (error) {
              if (error) { return done(error); }
              count += 1;
              if (count === docs.length) {
                done(null);
              }
            });
          });
        } else {
          count += 1;
          if (count === docs.length) {
            done();
          }
        }
      });
    });
  }

  // Wrap the calls in closures, so we can chain them.
  function ensureUser(error) { User.ensureIndexes(error); }
  function ensureResponse(error) { Response.ensureIndexes(error); }
  function ensureForm(error) { Form.ensureIndexes(error); }
  function ensureSurvey(error) { Survey.ensureIndexes(error); }
  
  // Chain everything together
  chain([
    ensureUser,
    ensureResponse,
    ensureForm,
    ensureSurvey,
    ensureSlugs
  ], callback)();
}

var opts = {
  db: {
    w: 1,
    safe: true,
    native_parser: settings.mongo_native_parser
  }
};

if (settings.mongo_user !== undefined) {
  opts.user = settings.mongo_user;
  opts.pass = settings.mongo_password;
}

mongoose.connect(settings.mongo_host, settings.mongo_db, settings.mongo_port, opts);

var db = mongoose.connection;

db.on('error', function (error) {
  console.log('Error connecting to mongo server.');
  console.log(error);
  throw error;
});

db.once('open', function () {
  ensureStructure(db, function () {
    db.close();
  });
});
