/*jslint node: true */
'use strict';

/*
 * ==================================================
 * Surveys
 * ==================================================
 */

var util = require('./util');


/*
 * app: express server
 * db: mongodb database
 * idgen: unique ID generator
 * collectionName: name of surveys collection
 */
function setup(app, db, idgen, collectionName) {
  function getCollection(cb) {
    return db.collection(collectionName, cb);
  }
  
  // Get all surveys
  // GET http://localhost:3000/api/surveys
  app.get('/api/surveys', function(req, response) {
    var handleError = util.makeErrorHandler(response);
    getCollection(function(err, collection) {
            
      if (handleError(err)) { return; }
      collection.find({}, function(err, cursor) {
        if (handleError(err)) { return; }
        cursor.toArray(function(err, items) {
          if (handleError(err)) { return; }
          response.send({surveys: items});
        });
      });
    });
  });

  // Get a survey
  // GET http://localhost:3000/api/surveys/{SURVEY ID}
  app.get('/api/surveys/:sid', function(req, response) {
    var handleError = util.makeErrorHandler(response);
    getCollection(function(err, collection) {
      if (handleError(err)) { return; }
      collection.find({id: req.params.sid}, function(err, cursor) {
        if (handleError(err)) { return; }
        cursor.toArray(function(err, items) {
          if (handleError(err)) { return; }
          if (items.length === 0) {
            response.send();
            return;
          }
          if (items.length > 1) {
            console.log('!!! WARNING: There should only be one item with a given ID');
            console.log('!!! Found ' + items.length);
            console.log('!!! Items: ' + JSON.stringify(items));
          }
          response.send({survey: items[0]});
        });
      });
    });
  });

  // Add a survey
  // POST http://localhost:3000/api/surveys
  app.post('/api/surveys', function(req, response) {
    var handleError = util.makeErrorHandler(response);
    var surveys = req.body.surveys;
    var total = surveys.length;
    var count = 0;
    getCollection(function(err, collection) {
      // Iterate over each survey
      surveys.forEach(function(survey) {
        var id = idgen();
        survey.id = id;
        // Add to database.
        collection.insert(survey, function(error) {
          if (handleError(error)) { return; }

          // Check if we've added all of them.
          count += 1;
          if (count === total) {
            response.send({surveys: surveys}, 201);
          }
        });
      });
    });
  });

  // Delete a survey
  // DELETE http://localhost:5000/api/surveys/{SURVEY ID}
  // TODO: We should probably clean up the objects from other collections that
  // pertain only to this survey.
  app.del('/api/surveys/:sid', function(req, response) {
    var sid = req.params.sid;
    getCollection(function(err, collection) {
      collection.remove({id: sid}, {safe: true}, function(error, count) {
        if (error) {
          console.log('Error removing survey ' + sid + 'from the survey collection: ' + error.message);
          response.send(500);
        } else {
          if (count !== 1) {
            console.log('!!! We should have removed exactly 1 entry. Instead we removed ' + count + ' entries.');
          }
          console.log('Deleted survey ' + sid);
          response.send({count: count});
        }
      });
    });
  });

}

module.exports = {
  setup: setup
};
