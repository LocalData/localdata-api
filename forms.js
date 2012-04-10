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
 *    { parcels: [ {parcel_id: 10, bubblesets: []} ]
 *    , mapping: { }   
 *    , type: "paper"  // collection medium ("paper" or "web")
 *    , survey: "1" // survey ID as a string
 *    }
 *  , { 
 *      type: "web"
 *  }]
*/

var util = require('./util');

module.exports = {
  setup: setup
};

handleError = util.handleError;

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

// GET http://localhost:3000/surveys/1/forms/2ec140e0-827f-11e1-83d8-bf682a6ee038
app.get('/surveys/:surveyid/forms/:formid', function(req, response) {
  var surveyid = req.params.surveyid;
  var formid = req.params.formid;
  console.log('Getting form ' + formid + ' of survey ' + surveyid);
  db.collection(FORMS, function(err, collection) {
    collection.find({'survey': surveyid, 'id': formid}, function(err, cursor) {
      if (err != null) {
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
            // TODO: Is this the right way to indicate that we found no such form?
            response.send({});
          }
        });
      }
    });
  });
});

// Get all the forms for a survey.
// GET http://localhost:3000/surveys/{SURVEY ID}/forms
app.get('/surveys/:sid/forms', function(req, response) {
  console.log('Returning all forms for survey ' + req.params.sid);
  db.collection(FORMS, function(err, collection) {
    collection.find({'survey': req.params.sid}, function(err, cursor) {
      if (err != null) {
        console.log('Error finding forms for survey ' + req.params.sid + ': ' + err);
        response.send();
        return;
      }
      var arr = [];
      cursor.each(function(err, doc) {
        if (doc == null) {
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
 * POST http://localhost:3000/surveys/{SURVEY ID}/forms
 */
app.post('/surveys/:sid/forms', function(req, response) {
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
        if (++count === total) {
          response.send({forms: forms});
        }
      });
    });
  });
});

/*
 * Delete all forms from a survey.
 * This is maintainence functionality. Regular clients should not delete forms.
 * POST http://localhost:3000/surveys/{SURVEY ID}/forms
 */
app.del('/surveys/:sid/forms', function(req, response) {
  var survey = req.params.sid;
  console.log('!!! Deleting forms for survey ' + survey + ' from the database.');
  db.collection(FORMS, function(err, collection) {
    collection.remove({survey: survey}, {safe: true}, function(error, count) {
      if (error != null) {
        console.log('Error removing forms for survey ' + survey + ' from the form collection: ' + err.message);
        response.send();
      } else {
        response.send({count: count});
      }
    });
  });
});

// Get all forms that reference the specified parcel ID
// GET http://localhost:3000/surveys/{SURVEY ID}/parcels/{PARCEL ID}/forms
app.get('/surveys/:sid/parcels/:pid/forms', function(req, response) {
  var sid = String(req.params.sid);
  var pid = String(req.params.pid);
  console.log('Getting forms for survey ' + sid + ' that reference parcel ' + pid);
  getCollection(function(err, collection) {
    if (handleError(err, response)) return;
    collection.find({survey: sid, 'parcels.parcel_id': pid}, function(err, cursor) {
      if (handleError(err, response)) return;
      cursor.toArray(function(err, items) {
        if (handleError(err, response)) return;
        response.send({forms: items});
      }); // toArray
    }); // find
  }); // getCollection
});

}
