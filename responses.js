/*
 * ==================================================
 * Responses
 * ==================================================
 * 
 * Collects responses from web, mobile, and paper forms.
 * 
 * Data structure:
 * responses: [
 *   { parcels: [ {parcel_id: 10, responses: {'Q0': 0, 'Q1': 3}}, ]
 *   }, ]
 *   
 */
 

 
var util = require('./util');

module.exports = {
  setup: setup
};

var handleError = util.handleError;

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
  
  // Get all responses for a specific parcel.
  // TODO: At some point, parcel should become a generic geographic object ID.
  // GET http://localhost:3000/surveys/{SURVEY ID}/parcels/{PARCEL ID}/responses
  // GET http://localhost:3000/surveys/1/parcels/{PARCEL ID}/responses
  app.get('/surveys/:sid/parcels/:parcel_id/responses', function(req, response) {
    var surveyid = req.params.sid;
    var parcel_id = req.params.parcel_id;
    getCollection(function(err, collection) {
      collection.find({'survey': surveyid, 'parcels.parcel_id': parcel_id}, function(err, cursor) {
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
        if (handleError(err, response)) return;

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

  // Add responses for a survey.
  // POST http://localhost:3000/surveys/{SURVEY ID}/reponses
  // POST http://localhost:3000/surveys/1/reponses
  app.post('/surveys/:sid/responses', function(req, response) {
    var resps = req.body.responses;
    var total = resps.length;
    console.log('Adding ' + total + ' responses to the database.');
    var count = 0;
    getCollection(function(err, collection) {
      var surveyid = req.params.sid;
      // Iterate over each survey response we received.
      resps.forEach(function(resp) {
        var id = idgen();
        resp.id = id;
        resp.survey = surveyid;
        // Add response to database.
        collection.insert(resp, function() {
          // Check if we've added all of them.
          if (++count == total) {
            response.send({responses: resps});
          }
        });
      });
    });
  });

  // Delete all responses for a survey.
  // This is maintainence functionality. Regular clients should not delete forms.
  // DELETE http://localhost:3000/surveys/{SURVEY ID}/reponses
  // DELETE http://localhost:3000/surveys/1/reponses
  app.del('/surveys/:sid/responses', function(req, response) {
    var survey = req.params.sid;
    console.log('!!! Deleting responses for survey ' + survey + ' from the database.');
    getCollection(function(err, collection) {
      collection.remove({survey: survey}, {safe: true}, function(error, count) {
        if (error != null) {
          console.log('Error removing responses for survey ' + survey + ' from the response collection: ' + err.message);
          response.send();
        } else {
          response.send({count: count});
        }
      });
    });
  });

} // setup()
