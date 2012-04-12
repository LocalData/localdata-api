/*
 * ==================================================
 * Scans
 * Data format:
    {
      id: 'e4043210-84db-11e1-b34b-dd2b6e24c3e7',
      survey: '1',
      filename: 'img001.tif',
      mimetype: 'image/tiff'
      url: 'http://localhost:3000/uploaded_files/e4043210-84db-11e1-b34b-dd2b6e24c3e7',
      status: 'pending'
    }
 * status can be 'pending', 'working', or 'complete'
 * ==================================================
 */

var fs = require('fs');
var util = require('./util');

module.exports = {
  setup: setup
};

var handleError = util.handleError;

var UPLOAD_DIR = 'uploaded_files';
var STATUS_PENDING = 'pending';
var STATUS_WORKING = 'working';
var STATUS_COMPLETE = 'complete';

// Construct the image download URL using the server's hostname, as it appears
// to the client.
function makeDownloadPath(file, req) {
  return ['http:/', req.header('Host'), UPLOAD_DIR, file].join('/');
}

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
    var fileStream = fs.createWriteStream([UPLOAD_DIR, id].join('/'));
    console.log('Original filename: ' + filename);
    console.log('Assigned ID: ' + id);

    // Data
    var data = {
      id: id,
      survey: req.params.sid,
      filename: filename,
      mimetype: req.headers['x-mime-type'],
      url: makeDownloadPath(id, req),
      status: STATUS_PENDING
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
          body = JSON.stringify({success: 'true', name: [UPLOAD_DIR, filename].join('/')});
          response.end(body);
          console.log('Added file info:');
          console.log(JSON.stringify(data, null, '  '));
        });
      });
    });
  });

  // Get data for a scanned form
  // GET http://localhost:3000/surveys/{SURVEY ID}/scans/{SCAN ID}
  // GET http://localhost:3000/surveys/1/scans/234
  app.get('/surveys/:sid/scans/:id', function(req, response) {
    console.log('Getting data for a scanned image');
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

          console.log('Sending data for scan ' + doc.id);
          // Send the data
          response.send({scan: doc});
        });
      });
    });
  });

  // Get a scanned image
  // GET http://localhost:3000/uploaded_files/{SCAN ID}
  // GET http://localhost:3000/uploaded_files/234
  // TODO: add an extension to the stored filename, so that we don't have to
  // hit the server to determine MIME type
  app.get('/' + UPLOAD_DIR + '/:id', function(req, response) {
    console.log('Sending image file to client');
    var handleError = util.makeErrorHandler(response);
    var id = req.params.id;

    // Get the image data from the database
    getCollection(function(err, collection) {
      if (handleError(err)) return;
      collection.find({id: id}, function(err, cursor) {
        if (handleError(err)) return;
        cursor.nextObject(function(err, doc) {
          if (handleError(err)) return;

          // Set the content-type
          response.header('Content-Type', doc.mimetype);
          // Send the file
          var fullfilename = [UPLOAD_DIR, id].join('/');
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

  // Update scanned form data
  // PUT http://localhost:3000/surveys/{SURVEY_ID}/scans/{SCAN_ID}
  app.put('/surveys/:sid/scans/:id', function(req, response) {
    var id = req.params.id;
    var survey = req.params.sid;
    var status = req.body.scan.status;
    // Check validity of the status
    switch(status) {
      case STATUS_PENDING:
      case STATUS_WORKING:
      case STATUS_COMPLETE:
        console.log('Updating scan ' + id + ' with status ' + status);
        break;
      default:
        console.log('Got bad status: ' + status);
        response.send(400);
        return;
    }
    getCollection(function(err, collection) {
      if (handleError(err)) return;
      collection.findAndModify({'survey': survey, 'id': id},
                               {_id: 1},
                               {$set: {status: status}},
                               {new: true}, function(err, object) {
        response.send({scan: object});
      });
    });
  });
}

