/*jslint node: true */
'use strict';

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

var handleError = util.handleError;
var isArray = util.isArray;


/*
 * Turn a list of parcel attributes into a comma-separated string.
 * NOTE: Will break if used with strings with commas (doesn't escape!)
 */
function listToCSVString(row, headers, maxEltsInCell) {
  var arr = [];
  var i;
  for (i = 0; i < row.length; i += 1) {
    if (maxEltsInCell[headers[i]] === 1) {
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
 * Turn a list of parcel attributes into a KML string
 */ 
function listToKMLString(row, headers, maxEltsInCell) {
  var i;
  var elt = "\n<Placemark>";
  elt += "<name></name>";
  elt += "<description></description>";
  elt += "<Point><coordinates>" + row[4] + "</coordinates></Point>"; 
  elt += "<ExtendedData>";
  for (i = 0; i < row.length; i += 1) {
      elt += "<Data name=\"" + headers[i] + "\">";
      elt += "<displayName>" + headers[i] + "</displayName>";  
      
      if(row[i] != undefined) {
        elt += "<value>" + row[i] + "</value>";              
      }else {
        elt += "<value>" + "</value>";              
      }
      elt += "</Data>";
  }
  elt += "</ExtendedData></Placemark>\n";
  
  return elt;
}


/*
 * Don't limit the results in any way
 */
function filterAllResults(items) {
  return items;
};



/* Helper for the following fn */
String.prototype.endsWith = function(suffix) {
    return this.indexOf(suffix, this.length - suffix.length) !== -1;
};

function clone(obj) {
    if (null === obj || undefined === obj || "object" !== typeof obj) {
      return obj;
    }
    var copy = obj.constructor();
    var attr;
    for (attr in obj) {
      if (obj.hasOwnProperty(attr)) {
        copy[attr] = obj[attr];
      }
    }
    return copy;
}

/* 
 * Ugly function to separate uses (aka use1, use2, use3) into separate results
 * Really shouldn't need this after the WSU test.
 */
function filterToOneRowPerUse(items) {
  var results = [];
  var matchEndsWithDashNumber = /-\d+$/;
  // Go through every result
  var idx;
  for (idx = 0; idx < items.length; idx += 1) {
    
    var newResult;
    var result = items[idx];
    var useCount = parseInt(result.responses['use-count'], 10);
    
    // Correct for a bug in WSU survey that stored condition as condition-1
    // TODO: REMOVE LATER!
    if (result.responses.hasOwnProperty('condition-1')) {
      result.responses['condition'] = result['responses']['condition-1'];
    }
    
    // If there are multiple uses, loop through all of them.
    if (useCount > 1) {
      var toInclude = {};
      
      // Loop through all the uses
      for (var i=2; i <= useCount; i++) {
        var toFind = "-" + i.toString();      
        toInclude = {};

        // If the the key ends in toFind, let's include it.
        for (var key in result['responses']) {
          if (result['responses'].hasOwnProperty(key)) {
            
            var m = key.match(matchEndsWithDashNumber);
            if (m != null) {
              if (key.endsWith(toFind)) {
                // Strip off the -#
                var endIdx = m['index'];
                var newKey = key.substring(0,endIdx);
                toInclude[newKey] = result['responses'][key];
              };
            }else {
              // Find keys that don't end in -#. 
              // Make sure we don't already have something like this:
              if(!toInclude.hasOwnProperty(key)) {
                toInclude[key] = result['responses'][key];        
              }
            }
            
          };
        };

        newResult = clone(result);
        newResult['responses'] = toInclude;
              
        results.push(newResult);            
      }; // End loop through uses
      
      
      // catch that first set of uses
      toInclude = {};
      for (key in result['responses']) {
        if (result['responses'].hasOwnProperty(key)) {
          if (key.match(/-\d+$/) == null) {
            // Ok, now check if we already have something like this:
            toInclude[key] = result['responses'][key];        
          };
        };
      };
      newResult = clone(result);
      newResult['responses'] = toInclude;
      results.push(newResult);                  
    }else {
      results.push(result);
    }
  }
  
  return results;
};



/* 
 * Return only the most recent result for each parcel
 */
function filterToMostRecent(items) {
  // Keep track of the latest result for each object ID
  var latest = {};

  // Loop through all the items
  for (var i=0; i < items.length; i++) {
    var item = items[i];
    var parcelId = item.parcel_id;
    
    // console.log("testing========");
    // console.log(item);
    // console.log("--");
    // console.log(latest);
    // console.log("----");
    
    if (latest[parcelId] == undefined){
      // If there isn't a most recent result yet, just add it
      latest[parcelId] = item;
    } else {
      // We need to check if this result is newer than the latest one
      var oldDate = new Date(latest[parcelId].created);
      var newDate = new Date(item.created);
      if (oldDate.getTime() < newDate.getTime()) {
        latest[parcelId] = item;
      };
    };
  };
  
  // Covert the keyed array to a plain ol' list
  var latest_list = [];
  for (var key in latest) {
    if (latest.hasOwnProperty(key)) {
      latest_list.push(latest[key]);
    };
  };
  return latest_list;
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
  // Sort by creation date, newest first.
  // GET http://localhost:3000/api/surveys/{SURVEY ID}/responses
  // GET http://localhost:3000/api/surveys/1/responses
  app.get('/api/surveys/:sid/responses', function(req, response) {
    var surveyid = req.params.sid;
    getCollection(function(err, collection) {
      collection.find({'survey': surveyid},
                      {'sort': [['created', 'desc']]},
                      function(err, cursor) {
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
  // Sort by creation date, newest first.
  // TODO: At some point, parcel should become a generic geographic object ID.
  // GET http://localhost:3000/api/surveys/{SURVEY ID}/parcels/{PARCEL ID}/responses
  // GET http://localhost:3000/api/surveys/1/parcels/3728048/responses
  app.get('/api/surveys/:sid/parcels/:parcel_id/responses', function(req, response) {
    var surveyid = req.params.sid;
    var parcel_id = req.params.parcel_id;
    getCollection(function(err, collection) {
      collection.find({'survey': surveyid, 'parcel_id': parcel_id},
                      {'sort': [['created', 'desc']]},
                      function(err, cursor) {
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
  // GET http://localhost:3000/api/surveys/{SURVEY ID}/responses/{RESPONSE ID}
  // GET http://localhost:3000/api/surveys/1/responses/2ec140e0-827f-11e1-83d8-bf682a6ee038
  app.get('/api/surveys/:sid/responses/:rid', function(req, response) {
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
  // DELETE http://localhost:3000/api/surveys/{SURVEY ID}/responses/{RESPONSE ID}
  app.del('/api/surveys/:sid/responses/:rid', function(req, response) {
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
  // POST http://localhost:3000/api/surveys/{SURVEY ID}/reponses
  // POST http://localhost:3000/api/surveys/1/reponses
  // Expects data in the format: 
  // responses: [
  //  { parcels: [ {parcel_id: '10', responses: {'Q0': 0, 'Q1': 3}} ]}, ...]
  app.post('/api/surveys/:sid/responses', function(req, response) {
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
        if (resp.geo_info !== undefined) {
          var centroid = resp.geo_info.centroid;
          if (centroid !== undefined) {
            centroid[0] = parseFloat(centroid[0]);
            centroid[1] = parseFloat(centroid[1]);
          }
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
  // DELETE http://localhost:3000/api/surveys/{SURVEY ID}/reponses
  // DELETE http://localhost:3000/api/surveys/1/reponses
  app.del('/api/surveys/:sid/responses', function(req, response) {
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
  // Sort by creation date, newest first.
  // GET http://localhost:3000/api/surveys/{SURVEY ID}/reponses/in/lower-left lat,lower-left lng, upper-right lat, upper-right lng
  // GET http://localhost:3000/api/surveys/{SURVEY ID}/reponses/in/1,2,3,4
  app.get('/api/surveys/:sid/responses/in/:bounds', function(req, response) {
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
    var query = {'survey': surveyid, 'geo_info.centroid': {"$within": { "$box": bbox}}};
    console.log("Bounds query ====================");
    console.log(query['geo_info.centroid']['$within']["$box"]);
    
    getCollection(function(err, collection) {
      collection.find(query,
                      {'sort': [['created', 'desc']]},
                      function(err, cursor) {
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
  
  
  // Take a list of rows and export them as CSV
  function CSVWriter(response, rows, headers, maxEltsInCell) {
    // CSV output
    response.writeHead(200, {
      'Content-Type': 'text/csv'
    });
    // Turn each row into a CSV line
    response.write(listToCSVString(headers, headers, maxEltsInCell));
    response.write('\n');
    var i;
    for (i = 0; i < rows.length; i += 1) {
      response.write(listToCSVString(rows[i], headers, maxEltsInCell));
      response.write('\n');
    }
    response.end();
  }
  

  // Take a list of rows and export them as KML
  function KMLWriter(response, rows, headers, maxEltsInCell){
    // KML output
    response.writeHead(200, {
      'Content-Type': 'application/vnd.google-earth.kml+xml'
    });
    
    response.write("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
    response.write("<kml xmlns=\"http://www.opengis.net/kml/2.2\">\n");
    response.write("<Document><name>KML Export</name><open>1</open><description></description>\n");
    response.write("<Folder>\n<name>Placemarks</name>\n<description></description>\n");
      
    console.log(rows);
    // Turn each row into a KML line
    for (var i = 0; i < rows.length; i++) {
      console.log("Writing list");
      response.write(listToKMLString(rows[i], headers, maxEltsInCell));
      response.write('\n');
    }
    
    response.write("\n</Folder></Document></kml>");
    
    response.end();
  }
  

  /**
  * Export a given survey. Includes options to filter and format the results.
  * 
  * @method exportSurveyAs
  * @param surveyID {String}
  * @param response {Object}
  * @param listOfFilteringFunctions {Array} Prepares the results for exporting 
  *           Each function in the array iterates through objects in the 
  *           survey and manipulates them, eg selects the most recent results
  * @param writer {Function} Writes a given record to a string
  */
  // 
  function exportSurveyAs(response, surveyId, listOfFilteringFunctions, writer){
    getCollection(function(err, collection) {
      collection.find({'survey': surveyId}, function(err, cursor) {
        
        if (err != null) {
          console.log('Error retrieving responses for survey ' + surveyid + ': ' + err.message);
          response.send(500);
          return;
        }

        cursor.toArray(function(err, items) {

          // Filter the items
          for (var idx in listOfFilteringFunctions) {
            items = listOfFilteringFunctions[idx](items);
          };

          // Start with some basic headers
          var headers = ['parcel_id', 'collector', 'timestamp', 'source', 'centroid'];

          // Record which header is at which index
          var headerIndices = {};
          var maxEltsInCell = {};
          var i;
          for (i = 0; i < headers.length; i++) {
            headerIndices[headers[i]] = i;
            maxEltsInCell[headers[i]] = 1;
          }

          // Iterate over each response
          var rows = [];
          var len = items.length;
          for (i = 0; i < len; i++) {
            var responses = items[i].responses;

            // console.log(items[i]);
            // Add context entries (parcel ID, source type)
            var row = [
              items[i].parcel_id, 
              items[i].source.collector,
              items[i].created,
              items[i].source.type,
              items[i].geo_info.centroid[1] + ',' + items[i].geo_info.centroid[0]
            ];

            // Then, add data about the element
            for (var resp in responses) {
              if (responses.hasOwnProperty(resp)) {
                // If we haven't encountered this column, track it.
                if (!headerIndices.hasOwnProperty(resp)) {
                  headerIndices[resp] = headers.length;
                  maxEltsInCell[resp] = 1;
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
                  if (entry.length > maxEltsInCell[resp]) {
                    maxEltsInCell[resp] = entry.length;
                  }
                }

                // Add the response to the CSV row.
                row[headerIndices[resp]] = responses[resp];
              }
            }

            // Add the CSV row.
            rows.push(row);
          } // End loop over every result


          // Write the response
          writer(response, rows, headers, maxEltsInCell);
          

        }); // end cursor.toArray()
      }); // end find results for survey
    });
  };

  // Return response data as CSV
  // GET http://localhost:5000/api/surveys/{SURVEY ID}/csv
  app.get('/api/surveys/:sid/csv', function(req, response) {
    var sid = req.params.sid;
    exportSurveyAs(response, sid, [], CSVWriter);
  });
  
  // Return CSV for WSU use
  // GET http://localhost:5000/api/surveys/{SURVEY ID}/csv-recent-peruse
  app.get('/api/surveys/:sid/csv-recent-peruse', function(req, response) {
    var sid = req.params.sid;
    exportSurveyAs(response, sid, [filterToMostRecent, filterToOneRowPerUse], CSVWriter);
  });
  
  // Return response data as KML
  // GET http://localhost:5000/api/surveys/{SURVEY ID}/kml
  app.get('/api/surveys/:sid/kml', function(req, response) {
    var sid = req.params.sid;
    exportSurveyAs(response, sid, [], KMLWriter);
  });  

} // setup()

module.exports = {
  setup: setup,
  listToCSVString: listToCSVString,
  filterAllResults: filterAllResults,
  filterToMostRecent: filterToMostRecent,
  filterToOneRowPerUse: filterToOneRowPerUse
};
