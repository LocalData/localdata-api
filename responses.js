/*
 * ==================================================
 * Responses
 * ==================================================
 * 
 * Collects responses from web, mobile, and paper forms.
 * 
 * Data structure for paper-originating response:
 * responses: [
 *   { parcel_id: "3728049",
 *     responses: {"type":3,"business":1},
 *     id: "cf1fa4c0-8e9e-11e1-8159-e53f8dbd1a6a",
 *     survey: "e458a930-8e27-11e1-b08f-37bd5a7df741",
 *     source : {type : "paper", scan: "", form: ""}
 *   }
 * ]
 * Data structure for mobile-originating response:
 * responses: [
 *   { parcel_id: "3728049",
 *     responses: {"type":3,"business":1},
 *     id: "cf1fa4c0-8e9e-11e1-8159-e53f8dbd1a6a",
 *     survey: "e458a930-8e27-11e1-b08f-37bd5a7df741",
 *     source : {type : "mobile"}
 *   }
 * ]
 *   
 */
 
 
var util = require('./util');

module.exports = {
  setup: setup,
  listToCSVString: listToCSVString
};

var handleError = util.handleError;
var isArray = util.isArray;


/*
 * Turn a list of parcels into a comma-separated string.
 * NOTE: Will break if used with strings with commas (doesn't escape')
 */
function listToCSVString(row, headers, headerCount) {
  var arr = [];
  for (var i = 0; i < row.length; i++) {
    if (headerCount[headers[i]] === 1) {
      // No multiple-choice for this column
      arr.push(row[i]);
    } else {
      // There might be multiple items in this cell.
      var len;
      if (!isArray(row[i])) {
        // This row only has one answer in this column, so just push that.
        arr.push(row[i]);
        len = 1;
      } else {
        // If it's an array of responses, join them with a semicolon
        arr.push(row[i].join(";"));          
      }
      
    }
  }

  return arr.join(',');
};


/*
 * Don't limit the results in any way
 */
function limitAllResults(items) {
  return items;
}

/* 
 * Return only the most recent result for each parcel
 */
function limitToMostRecent(items) {
  latest = {};
  
  // Array to list
  return latest;
}

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
  // GET http://localhost:3000/surveys/1/parcels/3728048/responses
  app.get('/surveys/:sid/parcels/:parcel_id/responses', function(req, response) {
    var surveyid = req.params.sid;
    var parcel_id = req.params.parcel_id;
    getCollection(function(err, collection) {
      collection.find({'survey': surveyid, 'parcel_id': parcel_id}, function(err, cursor) {
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

  // Delete a response from a survey
  // DELETE http://localhost:3000/surveys/{SURVEY ID}/responses/{RESPONSE ID}
  app.del('/surveys/:sid/responses/:rid', function(req, response) {
    var survey = req.params.sid;
    var id = req.params.rid;
    console.log('Removing response ' + id + ' from the database.');
    getCollection(function(err, collection) {
      collection.remove({survey: survey, id: id}, {safe: true}, function(error, count) {
        if (error != null) {
          console.log('Error removing response ' + id + ' for survey ' + survey + ' from the response collection: ' + err.message);
          response.send();
        } else {
          if (count != 1) {
            console.log('!!! We should have removed exactly 1 entry. Instead we removed ' + count + ' entries.');
          }
          response.send({count: count});
        }
      });
    });
  });

  // Add responses for a survey.
  // POST http://localhost:3000/surveys/{SURVEY ID}/reponses
  // POST http://localhost:3000/surveys/1/reponses
  // Expects data in the format: 
  // responses: [
  //  { parcels: [ {parcel_id: '10', responses: {'Q0': 0, 'Q1': 3}} ]}, ...]
  app.post('/surveys/:sid/responses', function(req, response) {
    var resps = req.body.responses;
    var total = resps.length;
    
    console.log(resps);
    console.log('Adding ' + total + ' responses to the database.');
    
    var count = 0;
    getCollection(function(err, collection) {
      var surveyid = req.params.sid;
      
      // Iterate over each survey response we received.
      resps.forEach(function(resp) {
        
        // Add metadata to the survey response
        var id = idgen();
        resp.id = id;
        resp.survey = surveyid;
        resp.created = new Date();
        
        // check if there is a centroid. if yes, make sure the values are floats
        // TODO: abstract into a testable function.
        var centroid = resp["geo_info"]["centroid"];
        if (centroid !== undefined) {
          centroid[0] = parseFloat(centroid[0]);
          centroid[1] = parseFloat(centroid[1]);
        }
        
        // Add response to database.
        collection.insert(resp, function() {
          console.log(resp);
          // Check if we've added all of them.
          if (++count == total) {
            console.log('Created ' + total + 'items. Returning.');
            response.send({responses: resps}, 201);
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
  
  
  // Get all responses in a bounding box
  // GET http://localhost:3000/surveys/{SURVEY ID}/reponses/in/lower-left lat,lower-left lng, upper-right lat, upper-right lng
  // GET http://localhost:3000/surveys/{SURVEY ID}/reponses/in/1,2,3,4
  app.get('/surveys/:sid/responses/in/:bounds', function(req, response) {
    var surveyid = req.params.sid;
    var bounds = req.params.bounds;
    var coords = bounds.split(",");
    if (coords.length != 4) {
      // There need to be four points.
      response.send(400);
    }
    for (var i = -1, ln = coords.length; ++i < ln;) {
      coords[i] = parseFloat(coords[i]);
    }
    
    
    var bbox = [[coords[0], coords[1]], [coords[2],  coords[3]]];
    query = {'survey': surveyid, 'geo_info.centroid': {"$within": { "$box": bbox}}};
    console.log("Bounds query ====================");
    console.log(query['geo_info.centroid']['$within']["$box"]);
    
    getCollection(function(err, collection) {
      collection.find(query, function(err, cursor) {
        if (handleError(err, response)) return;

        cursor.toArray(function(err, items) {
          if (!items || items.length === 0) {
            response.send({});
            return;
          }
          response.send({'responses': items});
        });
      });
    });
  });
  

  function exportSurveyAsCSV(surveyId, listOfLimitingFunctions){
    getCollection(function(err, collection) {
      collection.find({'survey': surveyId}, function(err, cursor) {
        if (err != null) {
          console.log('Error retrieving responses for survey ' + surveyid + ': ' + err.message);
          response.send(500);
          return;
        }

        cursor.toArray(function(err, items) {

          // Limit the items
          //if list:
          //  for each in list: 
          //    items = each(list)

          // Start with some basic headers
          var headers = ['parcel_id', 'collector', 'timestamp', 'source'];

          // Record which header is at which index
          var headerIndices = {};
          var headerCount = {};
          var i;
          for (i = 0; i < headers.length; i++) {
            headerIndices[headers[i]] = i;
            headerCount[headers[i]] = 1;
          }

          // Iterate over each response
          var rows = [];
          var len = items.length;
          for (i = 0; i < len; i++) {
            var responses = items[i].responses;

            // Add context entries (parcel ID, source type)
            var row = [
              items[i].parcel_id, 
              items[i].source.collector,
              items[i].created,
              items[i].source.type
            ];

            // Then, add data about the element
            for (var resp in responses) {
              if (responses.hasOwnProperty(resp)) {
                // If we haven't encountered this column, track it.
                if (!headerIndices.hasOwnProperty(resp)) {
                  headerIndices[resp] = headers.length;
                  headerCount[resp] = 1;
                  headers.push(resp);
                  // Add an empty entry to each existing row, since they didn't
                  // have this column.
                  for (var j = 0; j < rows.length; j++) {
                    rows[j].push('');
                  }
                }
                var entry = responses[resp];

                // Check if we have multiple answers.
                if (isArray(entry)) {
                  if (entry.length > headerCount[resp]) {
                    headerCount[resp] = entry.length;
                  }
                }

                // Add the response to the CSV row.
                row[headerIndices[resp]] = responses[resp];
              }
            }

            // Add the CSV row.
            rows.push(row);
          } // End loop over every result


          // CSV output
          response.writeHead(200, {
            'Content-Type': 'text/csv'
          });
          // Turn each row into a CSV line
          response.write(listToCSVString(headers, headers, headerCount));
          response.write('\n');
          for (i = 0; i < len; i++) {
            response.write(listToCSVString(rows[i], headers, headerCount));
            response.write('\n');
          }
          response.end();

        }); // end cursor.toArray()
      }); // end find results for survey
    });
  };





  // Return response data as CSV
  // GET http://localhost:5000/surveys/{SURVEY ID}/csv
  app.get('/surveys/:sid/csv', function(req, response) {
    var sid = req.params.sid;

    exportSurveyAsCSV(sid, []);
  });

} // setup()
