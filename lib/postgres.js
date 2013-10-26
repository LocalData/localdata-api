/*jslint node: true */
'use strict';

/*
 * ==================================================
 * Postgresql client
 * ==================================================
 * 
 * Provides access to the geo database
 */

var pg = require('pg').native;
var settings = require('../settings');

var connectionString = settings.psqlConnectionString;

exports.getClient = function getClient(callback) {
  pg.connect(connectionString, function (error, client, done) {
    if (error) {
      console.log('Error connecting to geo database: ' + error.message);
      return callback(error);
    }
    callback(null, client, done);
  });
};

exports.close = function () {
};
