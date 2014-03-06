/*jslint node: true */

/*
 * Count all of the entries. Each Response object holds an array of one or more entries.
 *
 * Usage:
 *   $ envrun -e my-deployment.env node find-plural-entries.js
 *
 */
'use strict';

var mongo = require('../lib/mongo');
var Response = require('../lib/models/Response');

var db;

function run(done) {
  Response.aggregate({
    $project : {
      entries: '$entries'
    }
  }, {
    $unwind: '$entries'
  }, {
    $group: {
      _id: 'entries',
      count: { $sum: 1 }
    }
  }, function (error, doc) {
    console.log(JSON.stringify(doc));
    done(error);
  });
}

db = mongo.connect(function () {
  run(function (error) {
    if (error) {
      console.log(error);
      console.log(error.stack);
    }
    db.close();
  });
});
