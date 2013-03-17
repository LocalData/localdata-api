/*jslint node: true */
'use strict';

var util = require('../util');
var Response = require('../models/Response');

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
  var query = Response.find({
    survey: surveyId
  });

  // Sort in ascending order of creation, so CSV exports vary only at the
  // bottom (i.e., they grow from the bottom as we get more responses).
  query.sort({ created: 'asc' });

  query.lean()
  .exec(function (error, items) {
    if (error) {
      writer(error);
    }

    // Filter the items
    filters.forEach(function (filter) {
      items = filter(items);
    });

    // Start with some basic headers
    var headers = ['parcel_id', 'collector', 'timestamp', 'source', 'centroid'];

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
        items[i].source.collector,
        items[i].created,
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

/* Export helpers ........................................................................*/

/*
 * Turn a list of parcel attributes into a comma-separated string.
 * NOTE: Will break if used with strings with commas (doesn't escape!)
 */
function listToCSVString(row, headers, maxEltsInCell) {
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
}

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
    response.write(listToCSVString(headers, headers, maxEltsInCell));
    response.write('\n');
    var i;
    for (i = 0; i < rows.length; i += 1) {
      response.write(listToCSVString(rows[i], headers, maxEltsInCell));
      response.write('\n');
    }
    response.end();
  };
}

function listToKMLString(row, headers, maxEltsInCell) {
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
}

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
      response.write(listToKMLString(rows[i], headers, maxEltsInCell));
      response.write('\n');
    }
    
    response.write('\n</Folder></Document></kml>');
    
    response.end();
  };
}


exports.list = function list(req, res) {
  var objectId = req.query.objectId;
  var bbox = req.query.bbox;

  // Get paging parameters, if any
  var paging = util.getPagingParams(req);

  // If the client hasn't restricted the query by base object or by bounding
  // box, we require paging parameters.
  if (paging === null && objectId === undefined && bbox === undefined) {
    res.send(400, {
      type: 'QueryError',
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
    survey: req.params.surveyId
  };

  if (bbox !== undefined) {
    var coords = bbox.split(',');
    if (coords.length !== 4) {
      // There need to be four points.
      res.send(400, {
        type: 'QueryError',
        message: 'You must specify 4 points for a bbox parameter'
      });
      return;
    }

    var i, ln;
    for (i = 0, ln = coords.length; i < ln; i += 1) {
      coords[i] = parseFloat(coords[i]);
    }

    var parsedBbox = [[coords[0], coords[1]], [coords[2],  coords[3]]];
    conditions['geo_info.centroid'] = { '$within': { '$box': parsedBbox } };
  }

  if (objectId !== undefined) {
    conditions.object_id = objectId;
  }

  var query = Response.find(conditions);

  if (paging !== null) {
    query.skip(paging.startIndex);
    query.limit(paging.count);
  }

  query.sort({ created: sort });

  query.lean()
  .exec(function (error, responses) {
    if (util.handleError(error, res)) { return; }
    res.send({ responses: responses });
  });
};

exports.get = function get(req, res) {
  Response.findOne({
    survey: req.params.surveyId,
    id: req.params.responseId
  })
  .lean()
  .exec(function (error, response) {
    if (util.handleError(error)) { return; }
    if (response === null) {
      res.send(404);
    } else {
      res.send({ response: response });
    }
  });
};

exports.post = function post(req, res) {
  var data = req.body.responses;

  if (!util.isArray(data)) {
    res.send(400);
    return;
  }

  var surveyId = req.params.surveyId;
  var output = [];
  var count = data.length;
  var itemError = null;

  data.forEach(function (item) {
    // If we encountered an error saving one of the items, then we've already
    // returned an error status, so let's not try to save remaining items.
    if (itemError !== null) {
      return;
    }

    var response = new Response({
      survey: surveyId,
      source: item.source,
      geo_info: item.geo_info,
      parcel_id: item.parcel_id,
      responses: item.responses
    });

    response.save(function (error, doc) {
      if (error) {
        itemError = error;
        if (error.name === 'ValidationError') {
          res.send(400, error);
        } else {
          res.send(500);
        }
        return;
      }

      output.push(doc.toObject());
      count -= 1;

      if (count === 0) {
        output.sort(function (a, b) {
          return a.created - b.created;
        });
        res.send(201, { responses: output });
      }
    });

  });
};

exports.sendCSV = function sendCSV(req, res) {
  var surveyId = req.params.surveyId;
  exportResults(surveyId, [], makeCSVWriter(res));
};

exports.sendKML = function sendKML(req, res) {
  var surveyId = req.params.surveyId;
  exportResults(surveyId, [], makeKMLWriter(res));
};
