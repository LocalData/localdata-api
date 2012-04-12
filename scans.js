/*
 * ==================================================
 * Scans
 * ==================================================
 */

var fs = require('fs');
var util = require('./util');

module.exports = {
  setup: setup
};

var handleError = util.handleError;

/*
 * app: express server
 * db: mongodb database
 * idgen: unique ID generator
 * collectionName: name of scans collection
 */
function setup(app, db, idgen, collectionName) {
  function getCollection(cb) {
    return db.collection(collectionName, cb);
  }

  // Add scanned form for a survey.
  // This can be tested using the upload page:
  // http://localhost:3000/static/upload.html
  // POST http://localhost:3000/surveys/{SURVEY ID}/scans
  // POST http://localhost:3000/surveys/1/scans
  app.post('/surveys/:sid/scans', function(req, response) {
    console.log('Client is uploading a file');
    var filename = req.headers['x-file-name'];
    var id = idgen();
    var fileStream = fs.createWriteStream('uploaded_files/' + id);
    console.log('Original filename: ' + filename);
    console.log('Assigned ID: ' + id);

    // Data
    var data = {
      id: id,
      survey: req.params.sid,
      filename: filename,
      mimetype: req.headers['x-mime-type'],
      processed: false
    };

    // Add image info to the database.
    getCollection(function(err, collection) {
      collection.insert(data, function() {
        // Record the image data to a file
        req.on('data', function(data) {
          fileStream.write(data);
        });
        req.on('end', function() {
          // TODO: return the DB doc instead?
          body = JSON.stringify({success: 'true', name: 'uploaded_files/' + filename});
          response.end(body);
          console.log('Added file info:');
          console.log(JSON.stringify(data, null, '  '));
        });
      });
    });
  });

  // Get a scanned form
  // GET http://localhost:3000/surveys/{SURVEY ID}/scans/{SCAN ID}
  // GET http://localhost:3000/surveys/1/scans/234
  app.get('/surveys/:sid/scans/:id', function(req, response) {
    console.log('Sending image file to client');
    var handleError = util.makeErrorHandler(response);
    var id = req.params.id;
    var sid = req.params.sid;

    // Get the image data from the database
    getCollection(function(err, collection) {
      if (handleError(err)) return;
      collection.find({id: id, survey: sid}, function(err, cursor) {
        if (handleError(err)) return;
        cursor.nextObject(function(err, doc) {
          if (handleError(err)) return;

          // Set the content-type
          response.header('Content-Type', doc.mimetype);
          // Send the file
          var fullfilename = 'uploaded_files/' + doc.id;
          console.log('Sending file: ' + fullfilename);
          response.sendfile(fullfilename);
        });
      });
    });
  });

  // Get all the scanned form data for a survey
  // GET http://localhost:3000/surveys/{SURVEY ID}/scans
  // GET http://localhost:3000/surveys/1/scans
  app.get('/surveys/:sid/scans', function(req, response) {
    var handleError = util.makeErrorHandler(response);
    var sid = req.params.sid;

    // Get the image data from the database
    getCollection(function(err, collection) {
      if (handleError(err)) return;
      collection.find({survey: sid}, function(err, cursor) {
        if (handleError(err)) return;
        cursor.toArray(function(err, items) {
          response.send({scans: items});
        });
      });
    });
  });
}

