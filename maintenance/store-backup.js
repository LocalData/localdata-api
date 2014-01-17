#!/usr/bin/env node
/*jslint node: true */
'use strict';

/*
 * Store Heroku Postgresql backups to our S3 account, so we can keep them
 * forever and ever.
 * Run as a one-off dyno on Heroku:
 *   heroku run maintenance/store-backup.js BUCKET OPTIONAL-FILENAME-FRIENDLY-COMMENT `heroku pgbackups:url b005`
 *
 *   heroku run maintenance/store-backup.js localdata-backup lighting-experimentation-prashant `heroku pgbackups:url b001`
 *   heroku run maintenance/store-backup.js localdata-backup `heroku pgbackups:url b001`
 *
 * The file is stored in the bucket as something like /heroku-pg/2013-11-15T01:27:53.000Z-comment.dump
 */

var knox = require('knox');
var request = require('request');

var settings = require('../settings');

var bucket = process.argv[2];
var comment;
var herokuUrl;

if (process.argv.length > 4) {
  comment = process.argv[3];
  herokuUrl = process.argv[4];
} else {
  herokuUrl = process.argv[3];
}

var prefix = '/heroku-pg/';

var client = knox.createClient({
  key: settings.aws_key,
  secret: settings.aws_secret,
  bucket: bucket
});

// Request the dump data from Heroku's temporary URL (an S3 URL with temporary
// authorization through query string parameters)
var herokuRequest = request.get(herokuUrl);

herokuRequest.on('response', function (response) {
  // Grab the timestamp of the dump from the Last-Modified header.
  var ts = (new Date(response.headers['last-modified'])).toISOString();

  var name = prefix + ts;
  if (comment !== undefined) {
    name += '-' + comment;
  }
  name += '.dump';

  // Stream the data to our S3 bucket
  var uploadRequest = client.putStream(herokuRequest, name, {
    'Content-Length': response.headers['content-length'],
    'Content-Type': response.headers['content-type']
  }, function (error, res) {
    if (error) {
      console.log('Error sending the response to S3:');
      console.log(error);
      return;
    }

    console.log('Got status code ' + res.statusCode);
    // Pipe the S3 response body to stdout
    res.pipe(process.stdout);
  });

  herokuRequest.pipe(uploadRequest);
});

