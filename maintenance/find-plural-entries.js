/*jslint node: true */

/*
 * Find all of the responses (in the old responseCollection and structure) that
 * correspond to the same base feature as some other response.
 *
 * Usage:
 *   $ envrun -e my-deployment.env node find-plural-entries.js
 *
 * Or run on Heroku to mitigate network latency.
 */
'use strict';

var mongo = require('../lib/mongo');

var db;

function run(done) {
  db.collection('responseCollection').mapReduce(function map() {
    emit({
      survey: this.survey,
      object_id: this.object_id || this.parcel_id
    }, {
      survey: this.survey,
      object_id: this.object_id || this.parcel_id,
      ids: [this.id]
    });
  }, function reduce(key, vals) {
    var ids = [];
    vals.forEach(function (val) {
      ids = ids.concat(vals.ids);
    });
    return {
      survey: key.survey,
      object_id: key.object_id,
      ids: ids
    };
  }, {
    finalize: function finalize(key, value) {
      if (value.ids.length > 1) {
        return value;
      }
      return undefined;
    },
    jsMode: true,
    out: { inline: 1 }
  }, function (error, docs) {
    if (error) {
      console.log(error);
      return done(error);
    }
    var len = docs.length;
    var plurals = [];
    var i;
    for (i = 0; i < len; i += 1) {
      if (docs[i].value) {
        plurals.push(docs[i]);
      }
    }

    console.log(JSON.stringify(docs, null, 2));
    done();
  });
}

db = mongo.connect(function () {
  run(function () {
    db.close();
  });
});
