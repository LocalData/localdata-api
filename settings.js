/*jslint node: true */
'use strict';

var url = require('url');

var settings = module.exports;

// Are we in debug mode?
settings.secret = process.env.SECRET;

// Email settings
settings.email = {};
settings.email.from = 'LocalData <support@localdata.com>';
settings.email.to = process.env.TEST_EMAIL || 'LocalData <support@localdata.com>'; // Send test emails to your address!

// MongoDB
settings.mongo = process.env.MONGO;
settings.mongo_native_parser = false;
if (process.env.MONGO_NATIVE_PARSER !== undefined && process.env.MONGO_NATIVE_PARSER.toLowerCase() === 'true') {
  settings.mongo_native_parser = true;
}

// AWS
settings.aws_key = process.env.AWS_KEY;
settings.aws_secret = process.env.AWS_SECRET;

// S3
settings.s3_key = process.env.S3_KEY;
settings.s3_secret = process.env.S3_SECRET;
settings.s3_bucket = process.env.S3_BUCKET;
settings.s3_dir = process.env.S3_UPLOAD_DIR;
settings.exportBucket = process.env.EXPORT_BUCKET;
settings.exportDir = process.env.EXPORT_DIR;

// Postgresql parcel server
// Use Heroku-style primary postgresql database environment variable
settings.psqlConnectionString = process.env.DATABASE_URL;

// Tiles
settings.tilePrefix = process.env.TILESERVER_BASE;

// Cache (mongo, redis, none)
settings.cache = process.env.CACHE;

// Service name, used by the cache and by New Relic
settings.name = process.env.NAME || 'unknown';

// Static apps
settings.mobilePrefix = process.env.REMOTE_MOBILE_PREFIX;
settings.adminPrefix = process.env.REMOTE_ADMIN_PREFIX;
settings.appPrefix = process.env.REMOTE_APP_PREFIX || '';

// Shapefile conversion service
settings.converterBase = process.env.CONVERTER_BASE;

// Redis connection details
var redisURL = url.parse(process.env.REDIS_URL);
settings.redisHost = redisURL.hostname;
settings.redisPort = redisURL.port;
settings.redisPassword = undefined;
if (redisURL.auth) {
  settings.redisPassword = redisURL.auth.split(':')[1];
}

// Web server
settings.port = process.env.PORT || 3000;
settings.testSecurePort = 3838;

settings.NOANSWER = 'no response';
