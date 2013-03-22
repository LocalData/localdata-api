/*jslint node: true */

/*
 * Maintenance script to add the geo_info.points field to responses
 * 
 * Usage:
 * $ node addPoints.js
 * $ node addPoints.js settings-file.js
 *
 */
'use strict';

var mongo = require('mongodb');
var makeSlug = require('slug');
var util = require('../lib/util');

var settings;
if (process.argv.length > 2) {
  settings = require(process.cwd() + '/' + process.argv[2]);
} else {
  settings = require('../settings-test.js');
}

// Names of the MongoDB collections we use
var RESPONSES = 'responseCollection';

function simplify(ring) {
  // FIXME: Simplify the ring
  return ring.map(function (point) {
    return [parseFloat(point[0]), parseFloat(point[1])];
  });
}

function collectRingPoints(memo, ring) {
  simplify(ring).forEach(function (point) {
    memo.push(point);
  });
}

function collectPolygonPoints(memo, polygon) {
  polygon.forEach(function (ring) {
    collectRingPoints(memo, ring);
  });
}

function collectMultiPolygonPoints(memo, multiPolygon) {
  multiPolygon.forEach(function (polygon) {
    collectPolygonPoints(memo, polygon);
  });
}

function ensurePoints(db, done) {
  db.collection(RESPONSES, function(error, collection) {
    if (error) { return done(error); }

    // Collect all of the coordinates into one array, so we can index them.
    function addPoints(item, next) {
      if (item.geo_info === undefined || item.geo_info.geometry === undefined) {
        return process.nextTick(function () {
          next(addPoints, next);
        });
      }
      var points;
      if (item.geo_info.geometry !== undefined) {
        if (item.geo_info.geometry.type === 'MultiPolygon') {
          points = [];
          collectMultiPolygonPoints(points, item.geo_info.geometry.coordinates);
        } else if (item.geo_info.geometry.type === 'Polygon') {
          points = [];
          collectPolygonPoints(points, item.geo_info.geometry.coordinates);
        } else if (item.geometry.type === 'Point') {
          points = item.geo_info.geometry.coordinates;
        }
        collection.update({_id: item._id}, {$set: {'geo_info.points': points}}, {}, function (error, count) {
          if (error) { return done(error); }
          next(addPoints, next);
        });
      }
    }

    collection.find({'geo_info.points': { $exists: false }}, function (error, cursor) {
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
      getNext(addPoints, getNext);
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
