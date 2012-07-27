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

var knox = require('knox');
var util = require('./util');

module.exports = {
  setup: setup
};

var handleError = util.handleError;

var UPLOAD_DIR = 'uploaded_files';
var S3_BUCKET = 'cfadetroit_survey';
var STATUS_PENDING = 'pending';
var STATUS_WORKING = 'working';
var STATUS_COMPLETE = 'complete';

// Construct the image download URL using the server's hostname, as it appears
// to the client.
function makeDownloadPath(file, req) {
  return 'http://s3.amazonaws.com/' + S3_BUCKET + '/' + UPLOAD_DIR + '/' + file;
}

// Construct the S3 object location. This does not include the bucket name.
function makeS3Location(id) {
  return UPLOAD_DIR + '/' + id;
}

/*
 * app: express server
 * db: mongodb database
 * idgen: unique ID generator
 * collectionName: name of scans collection
 */
function setup(app, db, idgen, collectionName, settings) {
  var s3client =  knox.createClient({
    key: settings.s3_key,
    secret: settings.s3_secret,
    bucket: S3_BUCKET,
    secure: false
  });

  var workChecker = new WorkChecker();

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
    var buffers = [];
    console.log('Original filename: ' + filename);
    console.log('Assigned ID: ' + id);

    // Data
    var data = {
      id: id,
      survey: req.params.sid,
      filename: filename,
      mimetype: req.headers['x-mime-type'],
      url: makeDownloadPath(id, req),
      status: STATUS_PENDING,
      created: new Date()
    };

    getCollection(function(err, collection) {
      // Store the image data in buffers
      req.on('data', function(data) {
        buffers.push(data);
      });

      // When the upload has finished, we can figure out the content length
      // and send to Amazon.
      // TODO: use S3 Multipart uploads so we don't have to keep the whole
      // file around in Buffer objects.
      req.on('end', function() {
        var contentLength = buffers.reduce(function(len,el) { return len + el.length; }, 0);
        var s3request = s3client.put(makeS3Location(id), {
          'Content-Length': contentLength,
          'Content-Type': data.mimetype
        });

        // When we receive the S3 response, we're done.
        s3request.on('response', function(res) {
          res
          .on('data', function(chunk) { console.log(chunk.toString()); })
          .on('close', function(error) { console.log(error.message); })
          .on('end', function() {
            // TODO: return the DB doc instead?
            body = JSON.stringify({success: 'true', name: [UPLOAD_DIR, filename].join('/')});

            // Add image info to the database.
            collection.insert(data, function() {
              response.send(body, 201);
              console.log('Added file info:');
              console.log(JSON.stringify(data, null, '  '));

              // Track that we have pending scans
              workChecker.gotWork();
            });
          });
        });

        // Write to the S3 request.
        for (var i=0; i<buffers.length; i++) {
          console.log('Writing chunk ' + i + ' of ' + buffers.length + ' to S3.');
          s3request.write(buffers[i]);
        }
        s3request.end();
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

          if (doc == null) {
            console.log('No item found with id ' + id);
            response.send(404);
            return;
          }

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
  // TODO: make the S3 object publicly accessible and just redirect to its URL
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

          s3client.get(makeS3Location(id))
          .on('response', function(s3res) {
            console.log('Getting data from S3');
            console.log(s3res.statusCode);
            console.log(s3res.headers);
            s3res.on('data', function(chunk) {
              // Send a chunk to the Survey API client
              response.write(chunk);
            })
            s3res.on('end', function() {
              // End the response to the Survey API client
              response.end();
            });
          }).end();
        });
      });
    });
  });

  // Get all the scanned form data for a survey
  // Optionally filter according to the status
  // GET http://localhost:3000/surveys/{SURVEY ID}/scans
  // GET http://localhost:3000/surveys/1/scans
  // GET http://localhost:3000/surveys/1/scans?status=pending
  // GET http://localhost:3000/surveys/1/scans?status=complete
  app.get('/surveys/:sid/scans', function(req, response) {
    var handleError = util.makeErrorHandler(response);
    var sid = req.params.sid;
    var status = req.query.status;

    // Get the image data from the database
    getCollection(function(err, collection) {
      if (handleError(err)) return;

      var filter = {survey: sid};
      if (status) filter.status = status;
      collection.find(filter, function(err, cursor) {
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

  // Delete a single scanned form entry from a survey
  // DELETE http://localhost:3000/surveys/{SURVEY_ID}/forms/{FORM_ID}
  // TODO: remove the corresponding S3 object
  app.del('/surveys/:sid/scans/:id', function(req, response) {
    var survey = req.params.sid;
    var id = req.params.id;

    console.log('Removing scan ' + id + ' from the database.');
    getCollection(function(err, collection) {
      collection.remove({survey: survey, id: id}, {safe: true}, function(error, count) {
        if (error != null) {
          console.log('Error removing scan ' + id + ' for survey ' + survey + ' from the scan collection: ' + err.message);
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

  // Use long-polling to supply pending scans to a worker.
  // GET http://localhost:3000/work
  app.get('/work', function(req, response) {
    // Check the timeout.
    var delay = parseInt(req.headers['x-comet-timeout']);
    if (isNaN(delay)) delay = 2000;
    workChecker.onWork(delay, function(haswork) {
      response.send({haswork: haswork});
    });
  });

}

function WorkChecker() {
  var haswork = true;
  var callback = null;
  var timeoutId = null;

  this.onWork = function(delay, cb) {
    callback = cb;
    if (haswork) {
      haswork = false;
      callback(true);
    } else {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      // Wait until the supplied timeout before we respond that there is no
      // work.
      timeoutId = setTimeout(function() {
        callback(false);
        timeoutId = null;
      }, delay);
      console.log('Waiting ' + delay + ' ms before responding.');
    }
  };

  this.gotWork = function() {
    haswork = true;
    // See if we're holding onto a callback
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
      callback(true);
    }
  };
}
