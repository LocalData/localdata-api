/*
 * ==================================================
 * Responses
 * ==================================================
 */

module.exports = {
  setup: setup
};

/*
 * app: express server
 * db: mongodb database
 * idgen: unique ID generator
 * collectionName: name of responses collection
 */
function setup(app, db, idgen, collectionName) {
  function getCollection(cb) {
    return db.collection(collectionName, cb);
  }

  // Get all responses for a survey.
  // GET http://localhost:3000/surveys/{SURVEY ID}/responses
  // GET http://localhost:3000/surveys/1/responses
  app.get('/surveys/:sid/responses', function(req, response) {
    var surveyid = req.params.sid;
    getCollection(function(err, collection) {
      collection.find({'survey': surveyid}, function(err, cursor) {
        if (err != null) {
          console.log('Error retrieving responses for survey ' + surveyid + ': ' + err.message);
          response.send();
          return;
        }
        cursor.toArray(function(err, items) {
          response.send({responses: items});
        });
      });
    });
  });

  // Get a response for a survey.
  // GET http://localhost:3000/surveys/{SURVEY ID}/responses/{RESPONSE ID}
  // GET http://localhost:3000/surveys/1/responses/2ec140e0-827f-11e1-83d8-bf682a6ee038
  app.get('/surveys/:sid/responses/:rid', function(req, response) {
    var surveyid = req.params.sid;
    var responseid = req.params.rid;
    getCollection(function(err, collection) {
      collection.find({'survey': surveyid, 'id': responseid}, function(err, cursor) {
        if (err != null) {
          console.log('Error: ' + err.message);
          response.send();
          return;
        }
        cursor.toArray(function(err, items) {
          if (items.length > 1) {
            console.log('!!! WARNING: There should only be one response with a given id attached to a survey.');
            console.log('!!! Found ' + items.length);
            console.log('!!! Responses: ' + JSON.stringify(items));
          }
          if (items.length > 0) {
            response.send({response: items[0]});
          } else {
            response.send({});
          }
        });
      });
    });
  });
}
