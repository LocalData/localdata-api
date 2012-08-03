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
settings.s3_key = process.env.S3_KEY || 'FAKE_KEY';
settings.s3_secret = process.env.S3_SECRET || 'FAKE_SECRET';
settings.s3_bucket = 'cfadetroit_survey';
settings.s3_dir = 'uploaded_test_files';

// Web server
settings.port = 3030;
