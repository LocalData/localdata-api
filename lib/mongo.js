/*jslint node: true */
'use strict';

/*
 * ==================================================
 * Mongoose MongoDB connection
 * ==================================================
 *
 */

var mongoose = require('mongoose');
var settings = require('../settings');

exports.connect = function connect(done) {
  var db;
  var opts = {
    db: {
      w: 1,
      safe: true,
      native_parser: settings.mongo_native_parser
    },
    server: {
      socketOptions: {
        // If we attempt to connect for 45 seconds, stop.
        connectTimeoutMS: 45000,
        keepAlive: 1
      }
    }
  };

  mongoose.connect(settings.mongo, opts, done);

  db = mongoose.connection;

  db.on('reconnected', function () {
    console.log('We have reconnected to the MongoDB server.');
  });

  return db;
};
