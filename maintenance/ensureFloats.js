/*jslint node: true */

/*
 * Maintenance script to ensure that the geo_info.points field is an array of
 * number pairs and not string pairs.
 * TODO: also check geo_info.centroid and geo_info.geometry.coordinates
 * 
 * Usage:
 * $ node ensureFloats.js
 * $ node ensureFloats.js settings-file.js
 *
 */
'use strict';

var mongo = require('mongodb');
var util = require('../lib/util');

var settings;
if (process.argv.length > 2) {
  settings = require(process.cwd() + '/' + process.argv[2]);
} else {
  settings = require('../settings-test.js');
}

// Names of the MongoDB collections we use
var RESPONSES = 'responseCollection';

// TODO: Make sure centroids and geometry coordinates are also floats

function ensurePoints(db, done) {
  db.collection(RESPONSES, function(error, collection) {
    if (error) { return done(error); }

    // Make sure the points are arrays of floats, not strings
    function convertPoints(item, next) {
      var points = item.geo_info.points.map(function (point) {
        return point.map(parseFloat);
      });
      collection.update({_id: item._id}, {$set: {'geo_info.points': points}}, {}, function (error, count) {
        if (error) { return done(error); }
        next(convertPoints, next);
      });
    }

    collection.find({'geo_info.points': { $exists: true }}, function (error, cursor) {
      if (error) { return done(error); }

      function getNext(worker, next) {
        cursor.nextObject(function (error, item) {
          if (error) { return done(error); }
          if (item === null) {
            return done();
          }
          worker(item, next);
        });
      }
      getNext(convertPoints, getNext);
    });
  });
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
  function close(error) {
    if (error) {
      console.log('ERROR: ' + error.name);
      console.log(error.message);
      console.log(error.stack);
    }
    db.close();
  }
  if (settings.mongo_user !== undefined) {
    db.authenticate(settings.mongo_user, settings.mongo_password, function(err, result) {
      if (err) {
        console.log(err.message);
        db.close();
        return;
      }
      ensurePoints(db, close);
    });
  } else {
    ensurePoints(db, close);
  }
});
