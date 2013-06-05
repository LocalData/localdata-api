/*jslint node: true */
'use strict';

/*
 * ==================================================
 * Postgresql client
 * ==================================================
 * 
 * Provides access to the geo database
 */

var pg = require('pg');
var settings = require('./settings');

var connectionString;

connectionString = 'tcp://' + settings.psqlUser + ':' + settings.psqlPass + '@' + settings.psqlHost + '/' + settings.psqlName;

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
  pg.end();
};
