/*jslint node: true */
'use strict';

/*
 * ==================================================
 * Forms
 * ==================================================
 * 
 * Forms are generated & given to collectors.
 * Used with paper forms to track which parcels are attached to which printed 
 *  page.  
 * Not currently used with web forms. Will probably be used to record a
 *  generic for structure that can then be rendered in the browser.
 * 
 * Data structure: 
 * forms: [
 *    { parcels: [ {parcel_id: "10", bubblesets: [
 *      { "bubbles" :
 *        [ {"center" : [150, 425], "radius" : 15},
 *          {"center" : [210, 425], "radius" : 15},
 *          {"center" : [270, 425], "radius" : 15},
 *          {"center" : [330, 425], "radius" : 15},
 *          {"center" : [390, 425], "radius" : 15}
 *        ],
 *        "name" : "Q0"
 *      },
 *      { "bubbles" :
 *        [ {"center" : [150, 460], "radius" : 15},
 *          {"center" : [210, 460], "radius" : 15},
 *          {"center" : [270, 460], "radius" : 15},
 *          {"center" : [330, 460], "radius" : 15},
 *          {"center" : [390, 460], "radius" : 15}
 *        ],
 *        "name" : "Q1"
 *      }
 *    ]} ]
 *    , mapping: { }   
 *    , type: "paper"  // collection medium ("paper" or "web")
 *    , survey: "1" // survey ID as a string
 *    }
 *  , { 
 *      type: "web"
 *  }]
*/

var util = require('./util');

/*
 * app: express server
 * db: mongodb database
 * idgen: unique ID generator
 * FORMS: name of forms collection
 */
function setup(app, db, idgen, FORMS) {
  function getCollection(cb) {
    return db.collection(FORMS, cb);
  }

// GET http://localhost:3000/api/surveys/1/forms/2ec140e0-827f-11e1-83d8-bf682a6ee038
app.get('/api/surveys/:surveyid/forms/:formid', function(req, response) {
  var surveyid = req.params.surveyid;
  var formid = req.params.formid;
  console.log('Getting form ' + formid + ' of survey ' + surveyid);
  db.collection(FORMS, function(err, collection) {
    collection.find({'survey': surveyid, 'id': formid}, function(err, cursor) {
      if (err) {
        console.log('Error retrieving form ' + formid + ' of survey ' + surveyid + ': ' + err.message);
        response.send();
      } else {
        cursor.toArray(function(err, items) {
          if (items.length > 1) {
            console.log('!!! WARNING: There should only be one form with a given id attached to a survey.');
            console.log('!!! Found ' + items.length);
            console.log('!!! Forms: ' + JSON.stringify(items));
          }
          if (items.length > 0) {
            response.send({form: items[0]});
          } else {
            response.send(404);
          }
        });
      }
    });
  });
});

// Get all the forms for a survey.
// GET http://localhost:3000/api/surveys/{SURVEY ID}/forms
app.get('/api/surveys/:sid/forms', function(req, response) {
  console.log('Returning all forms for survey ' + req.params.sid);
  db.collection(FORMS, function(err, collection) {
    collection.find({'survey': req.params.sid}, function(err, cursor) {
      if (err) {
        console.log('Error finding forms for survey ' + req.params.sid + ': ' + err);
        response.send();
        return;
      }
      var arr = [];
      cursor.each(function(err, doc) {
        if (doc === null) {
          response.send({forms: arr});
        } else {
          arr.push(doc);
        }
      });
    });
  });
});

/*
 * Add forms to a survey.
 * This is done before a survey begins, as a setup task.
 * POST http://localhost:3000/api/surveys/{SURVEY ID}/forms
 */
app.post('/api/surveys/:sid/forms', function(req, response) {
  var forms = req.body.forms;
  var total = forms.length;
  console.log('Adding ' + total + ' forms to the database.');
  var count = 0;
  db.collection(FORMS, function(err, collection) {
    var survey = req.params.sid;
    // Iterate over each form we received.
    forms.forEach(function(form) {
      var id = idgen();
      form.id = id;
      form.survey = survey;
      // Add form to database.
      collection.insert(form, function() {
        // Check if we've added all of them.
        count += 1;
        if (count === total) {
          response.send({forms: forms}, 201);
        }
      });
    });
  });
});

/*
 * Delete all forms from a survey.
 * This is maintainence functionality. Regular clients should not delete forms.
 * POST http://localhost:3000/api/surveys/{SURVEY ID}/forms
 */
app.del('/api/surveys/:sid/forms', function(req, response) {
  var survey = req.params.sid;
  console.log('!!! Deleting forms for survey ' + survey + ' from the database.');
  db.collection(FORMS, function(err, collection) {
    collection.remove({survey: survey}, {safe: true}, function(error, count) {
      if (error) {
        console.log('Error removing forms for survey ' + survey + ' from the form collection: ' + err.message);
        response.send();
      } else {
        response.send({count: count});
      }
    });
  });
});

// Delete a single form from a survey
// DELETE http://localhost:3000/api/surveys/{SURVEY_ID}/forms/{FORM_ID}
app.del('/api/surveys/:sid/forms/:id', function(req, response) {
  var survey = req.params.sid;
  var id = req.params.id;

  console.log('Removing form ' + id + ' from the database.');
  getCollection(function(err, collection) {
    collection.remove({survey: survey, id: id}, {safe: true}, function(error, count) {
      if (error) {
        console.log('Error removing form ' + id + ' for survey ' + survey + ' from the form collection: ' + err.message);
        response.send();
      } else {
        if (count !== 1) {
          console.log('!!! We should have removed exactly 1 entry. Instead we removed ' + count + ' entries.');
        }
        response.send({count: count});
      }
    });
  });
});

// Get all forms that reference the specified parcel ID
// GET http://localhost:3000/api/surveys/{SURVEY ID}/parcels/{PARCEL ID}/forms
app.get('/api/surveys/:sid/parcels/:pid/forms', function(req, response) {
  var handleError = util.makeErrorHandler(response);
  var sid = String(req.params.sid);
  var pid = String(req.params.pid);
  console.log('Getting forms for survey ' + sid + ' that reference parcel ' + pid);
  getCollection(function(err, collection) {
    if (handleError(err)) { return; }
    collection.find({survey: sid, 'parcels.parcel_id': pid}, function(err, cursor) {
      if (handleError(err)) { return; }
      cursor.toArray(function(err, items) {
        if (handleError(err)) { return; }
        response.send({forms: items});
      }); // toArray
    }); // find
  }); // getCollection
});

}

module.exports = {
  setup: setup
};
