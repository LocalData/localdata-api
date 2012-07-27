/*jslint node: true */
'use strict';

/*
 * Settings for local testing with mocha.
 */

var settings = module.exports;

// MongoDB
settings.mongo_host = 'localhost';
settings.mongo_port = 27017;
settings.mongo_db = 'scratchdb';

// S3
settings.s3_key = 'FAKE_KEY';
settings.s3_secret = 'FAKE_KEY';

// Web server
settings.port = 3030;
