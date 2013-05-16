/*jslint node: true */

/*
 * Maintenance script to ensure coordinates are floats and not strings.
 * 
 * Usage:
 * $ node float-coords.js
 * $ node float-coords.js settings-file.js
 *
 * You can find the number of Polygons that have string coordinates in the mongo shell with
 *   db.responseCollection.find({"geo_info.geometry.coordinates.0.0.0": {$type: 2}}).count()
 * And MultiPolygons with
 *   db.responseCollection.find({"geo_info.geometry.coordinates.0.0.0.0": {$type: 2}}).count()
 *
 */
'use strict';

var mongoose = require('mongoose');
var async = require('async');

var Response = require('../lib/models/Response');

var settings;
if (process.argv.length > 2) {
  settings = require(process.cwd() + '/' + process.argv[2]);
} else {
  settings = require('../settings-test.js');
}

function fixGeometries(done) {
  var select = 'geo_info.geometry.coordinates';

  function process(query, work, done) {
    var count = 1000;
    function processChunk(start) {
      Response.find(query).select(select)
      .lean().skip(start).limit(count).exec(function (error, docs) {
        async.eachLimit(docs, 10, work, function (error) {
          if (error) { return done(error); }
          if (docs.length === 0) {
            return done(null);
          }
          processChunk(start + count);
        });

      });
    }
    processChunk(0);
  }

  var polygonCount = 0;
  function polygon(done) {
    console.log('Fixing polygons');
    var query = {
      'geo_info.geometry.coordinates.0.0.0': {$type: 2}
    };
    process(query, function (doc, next) {
      var points = doc.geo_info.geometry.coordinates[0];
      var i;
      var len = points.length;
      for (i = 0; i < len; i += 1) {
        points[0] = parseFloat(points[0]);
        points[1] = parseFloat(points[1]);
      }
      Response.update({ _id: doc._id }, { $set: { 'geo_info.geometry.coordinates': points } }).exec(next);
      polygonCount += 1;
    }, done);
  }

  var multiPolygonCount = 0;
  function multiPolygon(done) {
    console.log('Fixing multi-polygons');
    var query = {
      'geo_info.geometry.coordinates.0.0.0.0': {$type: 2}
    };
    process(query, function (doc, next) {
      var points = doc.geo_info.geometry.coordinates[0][0];
      var i;
      var len = points.length;
      for (i = 0; i < len; i += 1) {
        points[0] = parseFloat(points[0]);
        points[1] = parseFloat(points[1]);
      }
      Response.update({ _id: doc._id }, { $set: { 'geo_info.geometry.coordinates': points } }).exec(next);
      multiPolygonCount += 1;
    }, done);
  }

  polygon(function (error) {
    console.log('Fixed ' + polygonCount + ' Polygon geometries.');
    if (error) {
      console.log(error);
      return;
    }
    multiPolygon(function (error) {
      if (error) {
        console.log(error);
      }
      console.log('Fixed ' + multiPolygonCount + ' MultiPolygon geometries.');
      done(error);
    });
  });
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
  fixGeometries(function () {
    db.close();
  });
});
