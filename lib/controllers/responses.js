/*jslint node: true */
'use strict';

var async = require('async');
var knox = require('knox');
var makeSlug = require('slugs');
var request = require('request');
var util = require('../util');
var Response = require('../models/Response');
var Survey = require('../models/Survey');
var settings = require('../../settings');

var client = knox.createClient({
  key: settings.s3_key,
  secret: settings.s3_secret,
  bucket: settings.s3_bucket
});

var uploadDir = settings.s3_dir;
var uploadPrefix = 'http://' + settings.s3_bucket + '.s3.amazonaws.com/';
var converterBaseUrl = settings.converterBase;

var exportExpiration = 5 * 60 * 1000; // 5 minutes in milliseconds

function mappableMethod(name) {
  return function mappable(o) {
    return o[name]();
  };
}

/**
* Fetch all of the responses for a given survey. Grabs the entries in chunks,
* so we don't run into problems with large data sets.
* TODO: Very large data sets might take seconds, so we should probably use an
* export/conversion service like with shapefile export.
* @param surveyID {String}
* @param done {Function} callback that accepts an error object and an array of responses
*/
function getAllResponses(surveyId, done) {
  function getChunk(start, responses) {
    var count = 1000;
    console.log('Fetching chunk [' + start + ',' + count + ') from survey ' + surveyId);

    var query = Response.find({
      survey: surveyId
    });

    // Sort in ascending order of creation, so CSV exports vary only at the
    // bottom (i.e., they grow from the bottom as we get more responses).
    query.sort({ created: 'asc' });

    query.skip(start);
    query.limit(count);

    query.lean().exec(function (error, items) {
      if (error) {
        return done(error);
      }

      // If we didn't get as many items as we asked for, then this is the last chunk.
      if (items.length < count) {
        return done(null, responses.concat(items));
      }
      getChunk(start + count, responses.concat(items));
    });
  }
  getChunk(0, []);
}

/**
* Export a given survey. Includes options to filter and format the results.
*
* @method exportResults
* @param surveyID {String}
* @param filters {Array} Prepares the results for exporting
*           Each function in the array iterates through objects in the
*           survey and manipulates them, eg selects the most recent results
* @param writer {Function} Writes a given record to a string
*/
function exportResults(surveyId, filters, writer) {
  getAllResponses(surveyId, function (error, items) {
    if (error) {
      writer(error);
      return;
    }

    // Filter the items
    filters.forEach(function (filter) {
      items = filter(items);
    });

    // Start with some basic headers
    var headers = ['parcel_id', 'address', 'collector', 'timestamp', 'source', 'centroid'];

    // Record which header is at which index
    var headerIndices = {};
    var maxEltsInCell = {};
    var i;
    var j;
    for (i = 0; i < headers.length; i += 1) {
      headerIndices[headers[i]] = i;
      maxEltsInCell[headers[i]] = 1;
    }

    // Iterate over each response
    var rows = [];
    for (i = 0; i < items.length; i += 1) {

      // Add context entries (parcel ID, source type)
      var row = [
        items[i].parcel_id,
        items[i].geo_info.humanReadableName || '',
        items[i].source.collector,
        items[i].created.toISOString(), // Convert the date to ISO8601 format
        items[i].source.type,
        items[i].geo_info.centroid[0] + ',' + items[i].geo_info.centroid[1]
      ];

      // Then, add the survey results
      var resp;
      var responses = items[i].responses;
      for (resp in responses) {

        if (responses.hasOwnProperty(resp)) {
          // If we haven't encountered this column, track it.
          if (!headerIndices.hasOwnProperty(resp)) {
            headerIndices[resp] = headers.length;
            maxEltsInCell[resp] = 1;
            headers.push(resp);
            // Add an empty entry to each existing row, since they didn't
            // have this column.
            for (j = 0; j < rows.length; j += 1) {
              rows[j].push('');
            }
          }
          var entry = responses[resp];

          // Check if we have multiple answers.
          if (util.isArray(entry)) {
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
    writer(null, rows, headers, maxEltsInCell);
  });
}

/* Export helpers ............................................................*/

/*
 * Turn a list of parcel attributes into a comma-separated string.
 * NOTE: Will break if used with strings with commas (doesn't escape!)
 */
exports.listToCSVString = function listToCSVString(row, headers, maxEltsInCell) {
  var arr = [];
  var i;
  for (i = 0; i < row.length; i += 1) {
    if (maxEltsInCell[headers[i]] === 1) {

      // Check if the value is undefined
      if (row[i] === undefined) {
        row[i] = '';
      }

      // Check if we need to escape the value
      row[i] = String(row[i]);
      if(row[i].indexOf(',') !== -1){
        row[i] = '"' + row[i] + '"';
      }

      // No multiple-choice for this column
      arr.push(row[i]);

    } else {
      // There might be multiple items in this cell.
      // FIXME: It doesn't look like we use len
      var len;
      if (!util.isArray(row[i])) {

        // This row only has one answer in this column, so just push that.
        // Check first to see if it's an empty value
        if(row[i] !== undefined) {

          // Check if we need to escape the value
          row[i] = String(row[i]);
          if(row[i].indexOf(',') !== -1){
            row[i] = '"' + row[i] + '"';
          }

          arr.push(row[i]);
        } else {
          arr.push('');
        }

        len = 1;
      } else {
        // If it's an array of responses, join them with a semicolon
        arr.push(row[i].join(';'));
      }
    }
  }
  return arr.join(',');
};

function makeCSVWriter(response) {
  /*
   * Take a list of rows and export them as CSV
   * Rows: a list of rows of survey data, eg:
   * [ ["good", "bad", "4"], ["fine", "excellent", "5"]]
   * Headers: a list of survey headers as strings
   */
  return function CSVWriter(error, rows, headers, maxEltsInCell) {
    if (util.handleError(error, response)) { return; }

    // CSV output
    response.writeHead(200, {
      'Content-Type': 'text/csv',
      'Content-disposition': 'attachment; filename=Survey Export.csv'

    });
    // Turn each row into a CSV line
    response.write(exports.listToCSVString(headers, headers, maxEltsInCell));
    response.write('\n');
    var i;
    for (i = 0; i < rows.length; i += 1) {
      response.write(exports.listToCSVString(rows[i], headers, maxEltsInCell));
      response.write('\n');
    }
    response.end();
  };
}

exports.listToKMLString = function listToKMLString(row, headers, maxEltsInCell) {
  var i;
  var elt = '\n<Placemark>';
  elt += '<name></name>';
  elt += '<description></description>';

  // The coordinates come escaped, so we need to unescape them:
  elt += '<Point><coordinates>' + row[4] + '</coordinates></Point>';

  elt += '<ExtendedData>';
  for (i = 0; i < row.length; i += 1) {
      elt += '<Data name="' + headers[i] + '">';
      elt += '<displayName>' + headers[i] + '</displayName>';

      if (row[i] !== undefined) {
        elt += '<value>' + row[i] + '</value>';
      } else {
        elt += '<value></value>';
      }
      elt += '</Data>';
  }
  elt += '</ExtendedData></Placemark>\n';

  return elt;
};

function makeKMLWriter(response) {
  /*
   * Take a list of rows and export them as KML
   */
  return function KMLWriter(error, rows, headers, maxEltsInCell){
    if (util.handleError(error, response)) { return; }

    var i;

    response.writeHead(200, {
      'Content-Type': 'application/vnd.google-earth.kml+xml',
      'Content-disposition': 'attachment; filename=Survey Export.kml'
    });

    response.write('<?xml version="1.0" encoding="UTF-8"?>\n');
    response.write('<kml xmlns="http://www.opengis.net/kml/2.2">\n');
    response.write('<Document><name>KML Export</name><open>1</open><description></description>\n');
    response.write('<Folder>\n<name>Placemarks</name>\n<description></description>\n');

    // Turn each row into a KML line
    for (i = 0; i < rows.length; i += 1) {
      response.write(exports.listToKMLString(rows[i], headers, maxEltsInCell));
      response.write('\n');
    }

    response.write('\n</Folder></Document></kml>');

    response.end();
  };
}

// Make a Feature out of the nth entry in a response document
function makeFeature(doc, n) {
  var props = doc.properties;
  var entry = doc.entries[n];

  var feature = {
    id: doc._id,
    properties: {},
    geometry: doc.geometry
  };

  feature.properties = {
    survey: props.survey,
    humanReadableName: props.humanReadableName,
    object_id: props.object_id,
    centroid: props.centroid,
    // Pull in the per-entry properties
    source: entry.source,
    created: entry.created,
    files: entry.files,
    responses: entry.responses
  };

  return feature;
}

/**
 * Convert responses to GeoJSON
 * @param  {Array} items An array of responses
 * @return {Object}      A GeoJSON FeatureCollection
 */
function responsesToGeoJSON(items, latestOnly) {
  var i;
  var j;
  var n = 0;
  var item;
  var numEntries;
  var features;
  var len = items.length;

  // We know the minimum number of features, so we can initialize the array to
  // have that length.
  features = new Array(len);

  for (i = 0; i < len; i += 1) {
    item = items[i];

    if (latestOnly) {
      features[n] = makeFeature(item, 0);
      n += 1;
    } else {
      numEntries = item.entries.length;
      for (j = 0; j < numEntries; j += 1) {
        features[n] = makeFeature(item, j);
        n += 1;
      }
    }
  }

  return {
    type: 'FeatureCollection',
    features: features
  };
}

/*
 * Return only the most recent result for each parcel
 */
exports.filterToMostRecent = function filterToMostRecent(items) {
  // Keep track of the latest result for each object ID
  var i;
  var key;
  var latest = {};

  // Loop through all the items
  for (i=0; i < items.length; i += 1) {
    var item = items[i];
    var parcelId = item.parcel_id;

    if (latest[parcelId] === undefined){
      // If there isn't a most recent result yet, just add it
      latest[parcelId] = item;
    } else {
      // We need to check if this result is newer than the latest one
      var oldDate = new Date(latest[parcelId].created);
      var newDate = new Date(item.created);
      if (oldDate.getTime() < newDate.getTime()) {
        latest[parcelId] = item;
      }
    }
  }

  // Covert the keyed array to a plain ol' list
  var latest_list = [];
  for (key in latest) {
    if (latest.hasOwnProperty(key)) {
      latest_list.push(latest[key]);
    }
  }
  return latest_list;
};


// This might return more results than expected. By default, we return one item
// per entry. But the database stores multiple entries per internal object, so
// the limit operator is not exact.
exports.list = function list(req, res) {
  var objectId = req.query.objectId;
  var collector = req.query.collector;
  var bbox = req.query.bbox;

  // Get paging parameters, if any
  var paging = util.getPagingParams(req);

  // If the client hasn't restricted the query by base object or by bounding
  // box, we require paging parameters.
  // TODO: enforce an upper bound on the number of object we will send back
  if (paging === null && objectId === undefined && bbox === undefined) {
    res.send(400, {
      name: 'QueryError',
      message: 'You must specify startIndex and count query parameters to avoid excessive server load'
    });
    return;
  }

  // Allow ascending or descending order according to creation time
  var sort = req.query.sort;
  if (sort !== 'asc') {
    sort = 'desc';
  }

  var conditions = {
    'properties.survey': req.params.surveyId
  };

  if (bbox !== undefined) {
    var coords = bbox.split(',');
    if (coords.length !== 4) {
      // There need to be four points.
      res.send(400, {
        name: 'QueryError',
        message: 'You must specify 4 points for a bbox parameter'
      });
      return;
    }

    var i, ln;
    for (i = 0, ln = coords.length; i < ln; i += 1) {
      coords[i] = parseFloat(coords[i]);
    }

    var west = coords[0];
    var south = coords[1];
    var east = coords[2];
    var north = coords[3];

    var boundingCoordinates = [ [ [west, south], [west, north], [east, north], [east, south], [west, south] ] ];
    conditions.indexedGeometry = {
      $geoIntersects: {
        $geometry: {
          type: 'Polygon',
          coordinates: boundingCoordinates
        }
      }
    };
  }

  if (objectId !== undefined) {
    conditions['properties.object_id'] = objectId;
  }

  if (collector !== undefined) {
    conditions['entries.source.collector'] = collector;
  }

  var query = Response.find(conditions);

  if (paging !== null) {
    query.skip(paging.startIndex);
    query.limit(paging.count);
  }

  query.sort({ 'entries.created': sort });

  query.lean()
  .exec(function (error, responses) {
    if (util.handleError(error, res)) { return; }
    // FIXME: we should send the number of internal response objects that led
    // to this set of results, in case the client wants to make requests in
    // pages.
    res.send(responsesToGeoJSON(responses, false));
  });
};

exports.get = function get(req, res) {
  Response.findOne({
    'properties.survey': req.params.surveyId,
    'entries._id': req.params.responseId
  })
  .exec(function (error, doc) {
    if (util.handleError(error)) { return; }
    if (doc === null) {
      res.send(404);
    } else {
      var response = doc.getSingleEntry(req.params.responseId);
      res.send({ response: response });
    }
  });
};


exports.del = function del(req, res) {
  Response.findOne({
    'properties.survey': req.params.surveyId,
    'entries._id': req.params.responseId
  })
  .exec(function (error, doc) {
    if (util.handleError(error)) { return; }
    if (doc === null) {
      res.send(404);
      return;
    }

    if (doc.entries.length === 1) {
      // If there's just one entry, remove the whole parent object.
      doc.remove(function (error) {
        if (error) { res.send (500); return; }
        res.send(204);
      });
    } else {
      // Remove only the relevant entry data.
      doc.entries.remove(req.params.responseId);
      doc.save(function (error) {
        if (util.handleError(error)) { return; }
        res.send(204);
      });
    }
  });
};


/**
 * Check if a given filename already exists
 * @param  {String}   name key to check if exists on S3.
 * @paran  {Function} callback that accepts true, false
 */
function checkIfFileNameExists(name, callback) {
  client.head(name).on('response', function(res){
    console.log(res.statusCode);
    console.log(res.headers);

    callback(res.statusCode === 200);
  }).end();
}

/**
 * Generate a filename for an uploaded image.
 * @param  {String}   orig       name of the uploaded file
 * @param  {String}   surveyId   id of the survey
 * @param  {String}   objectName human-readable name of the base object
 * @param  {Function} done       callback with parameter 'name'
 * @param  {Integer}  suffix     (optional) name suffix
 */
function makeFilename(orig, surveyId, objectName, done, suffix) {
  if (!orig || !surveyId || !objectName) {
    var message;

    if (!orig) {
      message = 'Original filename required when generating a remote filename';
    } else if (!surveyId) {
      message = 'Survey ID required when generative a remote filename';
    } else {
      message = 'Human-readable base object name required when generative a remote filename';
    }

    return done({
      name: 'FileNamingError',
      message: message
    });
  }

  console.log('Received file named ' + orig);

  // Get the date
  // TODO: the naming could get wonky around midnight if we need to use a
  // suffix. The date will change, so we'll have a "-1" suffix even if there is
  // no suffix-less file with that date.
  var today = new Date();
  var date = today.getDate();
  var month = today.getMonth() + 1; //Months are zero based
  var year = today.getFullYear();

  // Construct the name
  var name = uploadDir + '/';
  name = name + surveyId + '/';
  name = name + year + '-' + month + '-' + date + '-';
  name = name + makeSlug(objectName);

  if (suffix) {
    name = name + '-' + suffix.toString();
  }

  // Add the file extension
  var split = orig.split('.');
  var extension = split.slice(-1)[0];
  name = name + '.' + extension;

  // Check if the name works
  // If it doesn't, try to add suffixes until it does!
  checkIfFileNameExists(name, function(exists) {
    if (exists) {

      if (suffix === undefined) {
        suffix = 1;
      } else {
        suffix += 1;
      }
      makeFilename(orig, surveyId, objectName, done, suffix);

    } else {
      done(null, name);
    }
  });
}


/**
 * Save a list of responses
 * @param  {Array}  data The list of responses
 */
function saveResponses(res, data, surveyId) {
  var count = data.length;
  var itemError = null;
  var output = [];

  async.map(data, function (item, next) {
    var object_id = item.object_id;
    if (!object_id && item.parcel_id) {
      object_id = item.parcel_id;
    }

    var response = new Response({
      properties: {
        survey: surveyId,
        humanReadableName: item.geo_info.humanReadableName,
        object_id: object_id,
        centroid: item.geo_info.centroid,
        entries: []
      },
      geometry: item.geo_info.geometry
    });

    var entry = {
      source: item.source,
      responses: item.responses
    };

    // Add file paths, if any
    if (item.files !== undefined) {
      console.log('info at=add_files count=' + item.files.length);
      entry.files = item.files;
    }

    response.entries.push(entry);

    if (object_id) {
      // If there's an object_id field, then we issue an upsert, since we might
      // need to modify an existing document with the new entry.

      // Execute the pre-save middleware, which does not happen for
      // Model.update calls.
      // TODO: move this to the model.
      async.eachSeries(response._pres.save, function (f, step) {
        f.call(response, step);
      }, function (error) {
        if (error) {
          console.log(error);
          return next(error);
        }

        var query = {
          'properties.survey': surveyId,
          'properties.object_id': object_id
        };

        Response.update(query, response.toUpsertDoc(), {
          upsert: true
        }, function (error) {
          if (error) {
            return next(error);
          }

          // Update does not return the document. Retreive it, so we can send it
          // to the client.
          Response.findOne(query, next);
        });
      });
    } else {
      // If there's no object_id, then each Response doc has only one Entry
      // subdoc.
      response.save(next);
    }
  }, function (error, docs) {
    if (error) {
      if (error.name === 'ValidationError') {
        console.log('error at=save_response issue=invalid_data survey=' + surveyId);
        res.send(400, error);
      } else {
        console.log('error at=save_response issue=unknown_error error_name=' + error.name + ' survey=' + surveyId);
        console.log(error);
        res.send(500);
      }
      return;
    }
    res.send(201, { responses: docs.map(mappableMethod('getLatestEntry')) });
  });
}

exports.post = function post(req, res) {
  var data = req.body.responses;
  var surveyId = req.params.surveyId;

  // If this is a request with files, the response (only one is allowed)
  // arrives as a string
  var files = req.files;
  if (files) {
    if (!req.body.data) {
      console.log('Error: We received no response data, only file data.');
      res.send(400);
      return;
    }

    try {
      data = JSON.parse(req.body.data).responses;
    } catch (e) {
      res.send(400);
      console.log(e);
    }

    // You can only add 1 response if you're attaching a file
    if (data.length !== 1) {
      res.send(400);
      return;
    }
  }

  if (!util.isArray(data)) {
    res.send(400);
    return;
  }

  // Save each of the files
  // Note: we assume that all files being uploaded are images
  var savedFilePaths = [];
  if (files) {
    var fileList = [];
    var key;
    for (key in files) {
      if (files.hasOwnProperty(key)) {
        fileList.push(files[key]);
      }
    }

    async.each(fileList, function(file, callback) {

      // Generate a name for the file
      makeFilename(file.name, surveyId, data[0].geo_info.humanReadableName, function (error, fileName) {
        if (error) {
          callback(error);
          return;
        }

        console.log("Filename", fileName);

        // Save the file to S3
        client.putFile(file.path, fileName, function (error, response) {
          if (error) {
            callback(error);
            return;
          }
          if (200 === response.statusCode) {
            console.log('saved to %s', uploadPrefix + fileName);
            savedFilePaths.push(uploadPrefix + fileName);
            callback();
          } else {
            callback(new Error('Received status code ' + response.statusCode + ' trying to save a file to S3'));
          }
        });
      });

    }, function callback(error) {
      if (error) {
        console.log(error);
        res.send(500);
        return;
      }
      // Once we have all of the files saved, attach the list of filenames
      // to the first response object
      data[0].files = savedFilePaths;
      saveResponses(res, data, surveyId);
    });
  } else {
    // No files
    // Boring, much less work to do.
    saveResponses(res, data, surveyId);
  }

};

exports.sendCSV = function sendCSV(req, res) {
  var surveyId = req.params.surveyId;
  var filters = [];
  var latest = req.query.latest;

  // add ?latest=true to a CSV export to filter to the most recent
  if (latest) {
    filters.push(exports.filterToMostRecent);
  }

  exportResults(surveyId, filters, makeCSVWriter(res));
};

exports.sendKML = function sendKML(req, res) {
  var surveyId = req.params.surveyId;
  exportResults(surveyId, [], makeKMLWriter(res));
};

exports.handleShapefile = function handleShapefile(req, res) {
  var surveyId = req.params.surveyId;

  // Check if we've recently generated a shapefile
  Survey.findOne({ id: surveyId }, 'slug exports').exec(function (error, doc) {
    if (util.handleError(error, res)) { return; }

    if (!doc) {
      res.send(404);
      return;
    }

    // If the generated shapefile is recent, then redirect the client with a 307 Temporary Redirect
    if (doc.exports && doc.exports.shapefile && doc.exports.shapefile.requested > (new Date(Date.now() - exportExpiration))) {
      res.send(307, 'Location: ' + doc.exports.shapefile.url);
      return;
    }

    // If the generated shapefile is old, or if we haven't generated one, then
    // ask the subordinate service to generate the shapefile, and send a 202
    // Accepted.
    request({
      method: 'POST',
      url: converterBaseUrl + '/' + doc.slug,
      json: {
        url: 'http://' + req.headers.host + '/api/surveys/' + surveyId + '/responses.geojson'
      }
    }, function (error, response, body) {
      if (util.handleError(error, res)) { return; }

      if (response.statusCode !== 202) {
        console.log('Error. Received an inappropriate status code from the shapefile conversion service: ' + response.statusCode);
        res.send(500);
        return;
      }

      if (doc.exports === undefined) {
        doc.exports = {};
      }

      doc.exports.shapefile = {
        requested: new Date(),
        url: body.url
      };

      doc.update({ $set: { exports: doc.exports } }, function (error, numAffected) {
        if (util.handleError(error, res)) { return; }
        res.send(202);
      });
    });

  });
};
