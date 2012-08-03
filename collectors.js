/*jslint node: true */
'use strict';

/*
 * ==================================================
 * Collectors
 * ==================================================
 */

var util = require('./util');

var handleError = util.handleError;

/*
 * app: express server
 * db: mongodb database
 * idgen: unique ID generator
 * collectionName: name of collectors collection
 */
function setup(app, db, idgen, collectionName) {
  function getCollection(cb) {
    return db.collection(collectionName, cb);
  }

  // Get a collector
  // GET http://localhost:3000/surveys/{SURVEY ID}/collectors/{COLLECTOR ID}
  // GET http://localhost:3000/surveys/1/collectors/2ec140e0-827f-11e1-83d8-bf682a6ee038
  app.get('/surveys/:sid/collectors/:cid', function(req, response) {
    var surveyid = req.params.sid;
    var cid = req.params.cid;
    getCollection(function(err, collection) {
      collection.find({'survey': surveyid, 'id': cid}, function(err, cursor) {
        if (handleError(err, response)) { return; }

        cursor.toArray(function(err, items) {
          if (items.length > 1) {
            console.log('!!! WARNING: There should only be one collector with a given id attached to a survey.');
            console.log('!!! Found ' + items.length);
            console.log('!!! Responses: ' + JSON.stringify(items));
          }
          if (items.length > 0) {
            response.send({collector: items[0]});
          } else {
            response.send({});
          }
        });
      });
    });
  });

  // Add collectors for a survey.
  // POST http://localhost:3000/surveys/{SURVEY ID}/collectors
  // POST http://localhost:3000/surveys/1/collectors
  app.post('/surveys/:sid/collectors', function(req, response) {
    var colls = req.body.collectors;
    var total = colls.length;
    console.log('Adding ' + total + ' collectors to the database.');
    var count = 0;
    getCollection(function(err, collection) {
      var surveyid = req.params.sid;
      // Iterate over each survey response we received.
      colls.forEach(function(coll) {
        var id = idgen();
        coll.id = id;
        coll.survey = surveyid;
        // Add collectors to database.
        collection.insert(coll, function() {
          // Check if we've added all of them.
          count += 1;
          if (count === total) {
            response.send({collectors: colls}, 201);
          }
        });
      });
    });
  });

  // Update a collector
  // PUT http://localhost:3000/surveys/{SURVEY ID}/collectors/{COLLECTOR ID}
  // PUT http://localhost:3000/surveys/1/collectors/2ec140e0-827f-11e1-83d8-bf682a6ee038
  app.put('/surveys/:sid/collectors/:cid', function(req, response) {
    var coll = req.body.collector;
    console.log('Updating a collector');
    getCollection(function(err, collection) {
      var surveyid = req.params.sid;
      var cid = req.params.cid;
      collection.findAndModify({'survey': surveyid, 'id': cid},
                               {'_id': 1},
                               {$set: {forms: coll.forms}},
                               {'new': true},
                               function(err, object) {
        if (handleError(err, response)) { return; }
        response.send({collector: object});
      });
    });
  });
}

module.exports = {
  setup: setup
};
