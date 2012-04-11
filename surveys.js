/*
 * ==================================================
 * Surveys
 * ==================================================
 */

var util = require('./util');

module.exports = {
  setup: setup
};


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
  // GET http://localhost:3000/surveys
  app.get('/surveys', function(req, response) {
    var handleError = util.makeErrorHandler(response);
    getCollection(function(err, collection) {
      if (handleError(err)) return;
      collection.find({}, function(err, cursor) {
        if (handleError(err)) return;
        cursor.toArray(function(err, items) {
          if (handleError(err)) return;
          response.send({surveys: items});
        });
      });
    });
  });

  // Get a survey
  // GET http://localhost:3000/surveys/{SURVEY ID}
  app.get('/surveys/:sid', function(req, response) {
    var handleError = util.makeErrorHandler(response);
    getCollection(function(err, collection) {
      if (handleError(err)) return;
      collection.find({id: req.params.sid}, function(err, cursor) {
        if (handleError(err)) return;
        cursor.toArray(function(err, items) {
          if (handleError(err)) return;
          if (items.length == 0) {
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
  // POST http://localhost:3000/surveys
  app.post('/surveys', function(req, response) {
    var surveys = req.body.surveys;
    var total = surveys.length;
    var count = 0;
    getCollection(function(err, collection) {
      // Iterate over each survey
      surveys.forEach(function(survey) {
        var id = idgen();
        survey.id = id;
        // Add to database.
        collection.insert(survey, function() {
          // Check if we've added all of them.
          if (++count == total) {
            response.send({surveys: surveys});
          }
        });
      });
    });
  });

}
