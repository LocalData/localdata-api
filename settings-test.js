/*jslint node: true */
'use strict';

/*
 * Settings for local testing with mocha.
 */

var settings = module.exports;

// Are we in debug mode?
settings.secret = process.env.SECRET;

// Email settings
settings.email = {};
settings.email.from = 'LocalData <support@localdata.com>';
settings.email.to = process.env.TEST_EMAIL || 'matth@localdata.com'; // Send test emails to your address!

// MongoDB
settings.mongo_host = 'localhost';
settings.mongo_port = 27017;
settings.mongo_db = 'scratchdb';
settings.mongo_native_parser = false;

// AWS
settings.aws_key = process.env.AWS_KEY || 'FAKE_KEY';
settings.aws_secret = process.env.AWS_SECRET || 'FAKE_SECRET';

// S3
settings.s3_key = process.env.S3_KEY || 'FAKE_KEY';
settings.s3_secret = process.env.S3_SECRET || 'FAKE_SECRET';
settings.s3_bucket = 'cfadetroit_survey';
settings.s3_dir = 'uploaded_test_files';

// Postgresql parcel server
settings.psqlHost = process.env.PSQL_HOST;
settings.psqlName = process.env.PSQL_NAME;
settings.psqlUser = process.env.PSQL_USER;
settings.psqlPass = process.env.PSQL_PASS;

// Static apps
settings.mobilePrefix = process.env.REMOTE_MOBILE_PREFIX;
settings.adminPrefix = process.env.REMOTE_ADMIN_PREFIX;
settings.appPrefix = process.env.REMOTE_APP_PREFIX;
settings.tilePrefix = process.env.TILESERVER_BASE;

// Tiles
settings.tilePrefix = process.env.TILESERVER_BASE;

// Shapefile conversion service
settings.converterBase = process.env.CONVERTER_BASE;

// Web server
settings.port = 3030;
settings.testSecurePort = 3838;
