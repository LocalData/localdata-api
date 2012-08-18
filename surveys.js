/*jslint node: true */
'use strict';

/*
 * ==================================================
 * Surveys
 * ==================================================
 */

var util = require('./util');
var makeSlug = require('slug');


function checkSlug(collection, name, index, done) {
  var slug = makeSlug(name);
  if (index > 0) {
    slug = slug + '-' + index;
  }

  // See if we've already used this slug.
  collection.find({ slug: slug }, function (err, cursor) {
    if (err) { return done(err); }
    cursor.count(function (err, count) {
      if (err) { return done(err); }
      if (count > 0) {
        checkSlug(collection, name, index + 1, done);
      } else {
        done(null, slug);
      }
    });
  });
}

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

  // Get the survey ID associated with a slug
  // GET http://localhost:3000/api/slugs/{SLUG}
  app.get('/api/slugs/:slug', function (req, response) {
    var handleError = util.makeErrorHandler(response);
    getCollection(function (err, collection) {
      if (handleError(err)) { return; }
      collection.find({slug: req.params.slug}, function (err, cursor) {
        if (handleError(err)) { return; }
        cursor.toArray(function (err, items) {
          if (handleError(err)) { return; }
          if (items.length === 0) {
            response.send(404);
            return;
          }

          if (items.length > 1) {
            console.log('!!! WARNING: There should only be one item with a given slug');
            console.log('!!! Found ' + items.length);
            console.log('!!! Items: ' + JSON.stringify(items));
          }
          response.send({
            survey: items[0].id
          });
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

        checkSlug(collection, survey.name, 0, function (err, slug) {
          if (handleError(err)) { return; }
          survey.slug = slug;
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
  setup: setup,
  checkSlug: checkSlug
};
