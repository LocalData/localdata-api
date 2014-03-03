#!/usr/bin/env node
/*jslint node: true */

/*
 * Compute a new indexedGeometry field for every Response document.
 * We should run this if we significantly change our algorithm for computing
 * the indexedGeometry field.
 *
 * Usage:
 *   $ envrun -e my-deployment.env --path recompute-indexed-geometry.js
 *
 * Or run on Heroku to mitigate network latency.
 */
'use strict';

var _ = require('lodash');
var async = require('async');

var mongo = require('../lib/mongo');
var Response = require('../lib/models/Response');

var db;

function log(data) {
  if (Object.prototype.toString.call(data) === '[object Error]' ||
     (data.name && data.message)) {
    console.log('Error: ' + data.name + '. ' + data.message);
    console.log(data);
    console.log(data.stack);
    if (Object.prototype.toString.call(data.errors) === '[object Array]') {
      data.errors.forEach(log);
    } else if (data.errors) {
      log(data.errors);
    }
    return;
  }
  console.log(Object.keys(data).map(function (key) {
    return key + '=' + data[key];
  }).join(' '));
}

var count = 0;
function task(doc, done) {
  var geom = Response.createIndexedGeometry(doc.geometry);
  Response.update({ _id: doc._id}, {
    $set: {
      indexedGeometry: geom
    }
  }, function (error) {
    count += 1;
    if (count % 100 === 0) {
      process.stdout.write('\rProcessed ' + count + ' documents.');
    }
    done(error);
  });
}

function run(done) {
  var stream = Response.find({})
  .select({ geometry: 1 })
  .snapshot()
  .lean()
  .stream();

  var queue = async.queue(task, 20);

  queue.saturated = function () {
    stream.pause();
  };

  queue.empty = function () {
    stream.resume();
  };

  stream.on('data', function (doc) {
    queue.push(doc);
  })
  .on('error', done)
  .on('close', function () {
    queue.drain = function () {
      process.stdout.write('\rProcessed ' + count + ' documents.');
      console.log('\nDone.');
      done();
    };
  });
}

db = mongo.connect(function () {
  run(function (error) {
    if (error) { log(error); }
    db.close();
  });
});

db.on('error', log);
