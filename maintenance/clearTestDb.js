/*jslint node: true */
/*
 * Maintenance script to clear the test database
 * 
 * Usage:
 * $ node clearTestDb.js
 *
 */
'use strict';

var mongo = require('mongodb');

var settings = require('../settings-test.js');
var db = new mongo.Db(settings.mongo_db, new mongo.Server(settings.mongo_host,
                                                          settings.mongo_port,
                                                          {}), {});

function clearDb(db) {
  db.dropDatabase(function (err) {
    if (err) {
      console.log(err.message);
    } else {
      console.log('Dropped the database.');
    }
    db.close();
  });
}

db.open(function() {
  if (settings.mongo_user !== undefined) {
    db.authenticate(settings.mongo_user, settings.mongo_password, function(err, result) {
      if (err) {
        console.log(err.message);
        db.close();
        return;
      }
      clearDb(db);
    });
  } else {
    clearDb(db);
  }
});
