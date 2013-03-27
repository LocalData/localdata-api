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

var mongo = require('mongodb');
var makeSlug = require('slug');

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
function checkSlug(collection, name, index, done) {
  var slug = makeSlug(name);
  if (index > 0) {
    slug = slug + '-' + index;
  }

  // See if we've already used this slug.
  // If we have, try another slug.
  collection.find({ slug: slug }, function (err, cursor) {
    if (err) { return done(err); }
    cursor.count(function (err, count) {
      if (err) { return done(err); }
      if (count > 0) {
        checkSlug(collection, name, index + 1, done);
      } else {
        done(null, slug);
      }
    });
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
  function ensureUsers(done) {
    db.collection(USERS, function(error, collection) {
      if (error) { return done(error); }

      chain([function indexCreated(done) {
        // Make sure email is unique
          collection.ensureIndex({ "email": 1 }, { unique: true }, done);
      }], done)();
    });
  }

  function ensureResponses(done) {
    db.collection(RESPONSES, function (error, collection) {
      if (error) { return done(error); }
      chain([function indexCentroid(done) {
        // Ensure we have a geo index on the centroid field.
        collection.ensureIndex({'geo_info.centroid': '2d'}, done);
      },
      function indexCreated(done) {
        // Index the creation date, which we use to sort
        collection.ensureIndex('created', done);
      },
      function indexSurvey(done) {
        // Index the survey ID, which we use to look up sets of responses
        collection.ensureIndex('survey', done);
      },
      function indexParcelId(done) {
        // Index the parcel ID
        collection.ensureIndex('parcel_id', done);
      }], done)();
    });
  }

  function ensureForms(done) {
    db.collection(FORMS, function (error, collection) {
      if (error) { return done(error); }
      chain([function indexCreated(done) {
        // Index the creation date, which we use to sort
        collection.ensureIndex('created', done);
      },
      function indexParcelId(done) {
        // Index the parcel IDs, used by paper forms
        collection.ensureIndex('parcels.parcel_id', done);
      }], done)();
    });
  }

  function ensureSurveys(done) {
    db.collection(SURVEYS, function (error, collection) {
      if (error) { done(error); }
      chain([function indexSlug(done) {
        // Index the slug field.
        collection.ensureIndex('slug', done);
      },
      function indexId(done) {
        // Index the survey ID.
        collection.ensureIndex('id', done);
      }], done)();
    });
  }

  function ensureSlugs(done) {
    db.collection(SURVEYS, function (error, collection) {

      // First, find all surveys.
      collection.find({}, function(err, cursor) {
        cursor.toArray(function (err, arr) {

          // Reject if there's an error
          if (err) { return done(err); }
          var count = 0;

          // Look for surveys with no slug
          // There are no surveys yet, so there's nothing to do.
          if (arr.length === 0) {
            return done();
          }

          arr.forEach(function (item) {

            // Add a slug if there isn't one
            if (item.slug === undefined) {
              checkSlug(collection, item.name, 0, function (err, slug) {
                if (err) { return done(err); }

                // Update entry
                collection.update({_id: item._id}, {'$set': {slug: slug}}, function (error) {
                  if (err) { return done(err); }
                  count += 1;
                  if (count === arr.length) {
                    done();
                  }
                });
              });
            } else {
              count += 1;
              if (count === arr.length) {
                done();
              }
            }
          });
        });
      });
    });
  }
  
  // Chain everything together
  chain([ensureUsers, ensureResponses, ensureForms, ensureSurveys, ensureSlugs], callback)();
}

var db = new mongo.Db(settings.mongo_db,
                      new mongo.Server(settings.mongo_host,
                                       settings.mongo_port,
                                       { auto_reconnect: true }),
                      { w: 1,
                        safe: true,
                        native_parser: settings.mongo_native_parser
});

db.open(function() {
  function close() { db.close(); }
  if (settings.mongo_user !== undefined) {
    db.authenticate(settings.mongo_user, settings.mongo_password, function(err, result) {
      if (err) {
        console.log(err.message);
        db.close();
        return;
      }
      ensureStructure(db, close);
    });
  } else {
    ensureStructure(db, close);
  }
});
