/*jslint node: true */
'use strict';

var _ = require('lodash');
var async = require('async');
var cuid = require('cuid');
var knox = require('knox');
var logfmt = require('logfmt');
var makeSlug = require('slugs');
var mongoose = require('mongoose');
var Promise = require('bluebird');

var util = require('../util');
var Response = require('../models/Response');
var Survey = require('../models/Survey');
var settings = require('../../settings');
var tasks = require('../tasks');

Promise.promisify(Response);

var client = knox.createClient({
  key: settings.s3_key,
  secret: settings.s3_secret,
  bucket: settings.s3_bucket
});

var exportClient = knox.createClient({
  key: settings.s3_key,
  secret: settings.s3_secret,
  bucket: settings.exportBucket
});

var uploadDir = settings.s3_dir;
var uploadPrefix = 'http://' + settings.s3_bucket + '.s3.amazonaws.com/';

// How long an export file remains valid
var exportDuration = 2 * 60 * 1000; // 2 minutes in milliseconds

// How long we wait for a queued export task before deciding to ask again
// This should account for the time it takes to get to the task and the time it
// takes to generate/store the export.
var exportRequestDuration = 5 * 60 * 1000; // 5 minutes in milliseconds

// The API does not currently use a format that corresponds to our GeoJSON
// representation. We need to format responses as expected until the breaking
// API change.
// https://github.com/LocalData/localdata-api/issues/155
function formatForAPI(data) {
  return {
    id: data.id,
    survey: data.properties.survey,
    source: data.properties.source,
    created: data.properties.created,
    modified: data.properties.modified,
    geo_info: {
      geometry: data.geometry,
      centroid: data.properties.centroid,
      humanReadableName: data.properties.humanReadableName,
      parcel_id: data.properties.object_id
    },
    info: data.properties.info,
    parcel_id: data.properties.object_id,
    object_id: data.properties.object_id,
    responses: data.properties.responses,
    files: data.properties.files
  };
}

// Make a Feature out of the nth entry in a response document
function makeFeature(doc, n) {
  var props = doc.properties;
  var entry = doc.entries[n];

  var feature = {
    type: 'Feature',
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
    modified: entry.modified,
    files: entry.files,
    responses: entry.responses
  };

  return feature;
}

/**
 * Convert responses to GeoJSON
 * @param  {Array} items An array of responses
 * @param  {Object} options Options object
 * @param  {Boolean} options.latestOnly True if we should only use the latest entry for each base feature
 * @return {Object}      A GeoJSON FeatureCollection
 */
function responsesToGeoJSON(items, options) {
  var i;
  var j;
  var n = 0;
  var item;
  var numEntries;
  var features;
  var len = items.length;
  var latestOnly = options.latestOnly;

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
 * Return only the most recent result for each base feature
 */
exports.getLatestEntries = function getLatestEntries(items) {
  var i;
  var entries = [];

  // Loop through all the items
  for (i = 0; i < items.length; i += 1) {
    var item = items[i];
    entries.push(item.getLatestEntry());
  }
  return entries;
};

exports.getAllEntries = function getAllEntries(items) {
  var i;
  var j;
  var entries = [];

  // Loop through all the items
  for (i = 0; i < items.length; i += 1) {
    var item = items[i];
    for (j = 0; j < item.entries.length; j += 1) {
      entries.push(item.getSingleEntry(item.entries[j].id));
    }
  }
  return entries;
};


// This might return more results than expected. By default, we return one item
// per entry. But the database stores multiple entries per internal object, so
// the limit operator is not exact.
//
// Query keywords:
//    'after' -- date in milliseconds since jan 1 1970 (eg 1401628391446)
//    'bbox',
//    'collector',
//    'count',
//    'objectId',
//    'sort',
//    'startIndex'
//    'responses[key]=val' -- multiple key-val pairs to filter responses
//    'responses[key]=undefined' -- see above; finds where key doesn't exist
//    'until' -- date in milliseconds since jan 1 1970 (eg 1401628391446)
exports.list = function list(req, res) {
  var i, ln;
  var undefinedFilters = []; // filters for missing response keys

  var objectId = req.query.objectId;
  var collector = req.query.collector;
  var after = req.query.after;
  var until = req.query.until;
  var bbox = req.query.bbox;
  var filterParameters = req.query.responses;

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

  // Bounding box queries
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

  // Date filters
  if (until || after) {
    conditions['entries.created'] = {};

    if (until) {
      until = new Date(parseInt(until, 10));
      conditions['entries.created'].$lte = new Date(until);
    }

    if (after) {
      after = new Date(parseInt(after, 10));
      conditions['entries.created'].$gt = new Date(after);
    }
  }

  // Set up any filters
  if (filterParameters !== undefined) {
    _.each(filterParameters, function(value, filter) {
      if (value === 'undefined') {
        undefinedFilters.push(filter);
        var key = 'responses.' + filter;
        conditions.entries = { $elemMatch: {}};
        conditions.entries.$elemMatch[key] = { $exists: false };
      } else {
        var filterPath = 'entries.responses.' + filter;
        conditions[filterPath] = value;
      }
    });
  }

  var query = Response.find(conditions);

  if (paging !== null) {
    query.skip(paging.startIndex);
    query.limit(paging.count);
  }

  query.sort({ 'entries.created': sort });

  query
  .exec(function (error, responses) {
    if (util.handleError(error, res)) { return; }
    // FIXME: we should send the number of internal response objects that led
    // to this set of results, in case the client wants to make requests in
    // pages.

    // We may have to filter the responses a second time
    // Because the first pass includes false positives
    if (until || after || filterParameters) {
      _.each(responses, function(response) {

        // Construct a new, clean entries list
        // We can't just use slice() because it changes the indexes
        var entries = [];
        var include;
        _.each(response.entries, function(entry, index) {
          include = true;

          if (after && entry.created <= after) {
              include = false;
          }
          if (until && entry.created > until) {
            include = false;
          }

          for (i = 0, ln = undefinedFilters.length; i < ln; i += 1) {
            if (_.has(entry.responses, undefinedFilters[i])) {
              include = false;
            }
          }

          if (include) {
            entries.push(entry);
          }
        });
        response.entries = entries;
      });
    }

    if (res.locals.format === 'geojson') {
      res.send(responsesToGeoJSON(responses, { latestOnly: false }));
    } else {
      res.send({ responses: exports.getAllEntries(responses).map(formatForAPI) });
    }
  });
};

exports.get = function get(req, res) {
  Response.findOne({
    'properties.survey': req.params.surveyId,
    'entries._id': req.params.responseId
  })
  .exec(function (error, doc) {
    if (util.handleError(error, res)) { return; }
    if (doc === null) {
      res.send(404);
    } else {
      var response = formatForAPI(doc.getSingleEntry(new mongoose.Types.ObjectId(req.params.responseId)));
      res.send({ response: response });
    }
  });
};


exports.patch = function patch(req, res) {
  var data = req.body;
  var responseId = req.params.responseId;

  var set = {};

  // We need to set the modified date here because Mongoose doesn't trigger
  // pre for updates. Details: https://github.com/LearnBoost/mongoose/issues/964
  set['entries.$.modified'] = new Date();

  _.each(_.keys(data.responses), function(key) {
    set['entries.$.responses.' + key] = data.responses[key];
  });

  Response.update({
    'entries._id': responseId,
    'properties.survey': req.params.surveyId
  }, {
    $set: set
  }, function(error, numCompleted) {
    if (util.handleError(error, res)) { return; }
    res.send(204);
  });
};


exports.del = function del(req, res) {
  Response.findOneAndUpdateAsync({
    'properties.survey': req.params.surveyId,
    'entries._id': req.params.responseId
  }, {
    // Remove the matching entry from the array
    $pull: {
      entries: {
        _id: req.params.responseId
      }
    }
  }, {
    // Return the pre-modification document, so we have the full deleted entry.
    new: false
  }).then(function (doc) {
    if (!doc) {
      res.send(404);
      return;
    }

    // If the Response doc has no more entries, then we remove it.
    var tryRemoveEmptyResponse = Response.removeAsync({
      'properties.survey': req.params.surveyId,
      'properties.object_id': doc.properties.object_id,
      entries: { $size: 0 }
    }).catch(function (error) {
      // If we encounter an error, we will still have deleted the original
      // entry, so we still want to send a 204 back. Handle the error and log
      // helpful info for us to investigate.
      logfmt.log({
        error: true,
        at: 'try_remove_empty_response',
        survey: req.params.surveyId,
        object_id: doc.properties.object_id
      });
      logfmt.error(error);
    });

    // Take only the relevant entry data and place it in a zombie document.
    var entry = doc.entries.id(req.params.responseId);
    // If there are old entries with null responses hashes, coerce them into a
    // valid structure.
    if (!entry.responses) {
      entry.responses = {};
    }
    var deleted = new Response({
      properties: _.defaults({
        survey: {
          deleted: true,
          id: doc.properties.survey
        }
      }, doc.properties),
      geometry: doc.geometry.toObject(),
      entries: [entry.toObject()]
    });

    // Execute the pre-save middleware, which does not happen for
    // Model.update calls.
    var upsertZombieResponse = Promise.promisify(deleted.applyPreSave, deleted)()
    .then(function () {
      var query = {
        $or: [{
          'properties.survey': {
            deleted: true,
            id: doc.properties.survey
          }
        }, {
          'properties.survey': {
            id: doc.properties.survey,
            deleted: true
          }
        }],
        'properties.object_id': doc.properties.object_id
      };
      return Response.updateAsync(query, deleted.toUpsertDoc(), {
        upsert: true
      });
    }).catch(function (error) {
      // If we encounter an error, we will still have deleted the original
      // entry, so we still want to send a 204 back. Handle the error and log
      // helpful info for us to investigate.
      logfmt.log({
        error: true,
        at: 'upsert_zombie_response',
        survey: doc.properties.survey,
        object_id: doc.properties.object_id,
        entry_id: req.params.responseId,
        entry: JSON.stringify(entry)
      });
      logfmt.error(error);
    });

    // Wait for the (potential) removal and the upsert to complete.
    return Promise.join(tryRemoveEmptyResponse, upsertZombieResponse)
    .finally(function () {
      // If we encounter an error, we will still have deleted the original
      // entry, so we want to send a 204 back no matter what.
      res.send(204);
    });
  }).catch(function (error) {
    logfmt.error(error);
    res.send(500);
  });
};


/**
 * Generate a filename for an uploaded image.
 * @param  {String}   orig       name of the uploaded file
 * @param  {String}   surveyId   id of the survey
 * @param  {String}   objectName human-readable name of the base object
 */
function makeFilename(orig, surveyId, objectName, objectId) {
  if (!orig || !surveyId || (!objectName && !objectId)) {
    var message;

    if (!orig) {
      message = 'Original filename required when generating a remote filename';
    } else if (!surveyId) {
      message = 'Survey ID required when generating a remote filename';
    } else if (!objectName && !objectId) {
      message = 'Human-readable base object name or object ID required when generating a remote filename';
    }

    throw {
      name: 'FileNamingError',
      message: message
    };
  }

  console.log('info at=responses event=file_received name=' + orig);

  // Get the date
  var today = new Date();
  var date = today.getDate();
  var month = today.getMonth() + 1; //Months are zero based
  var year = today.getFullYear();

  var objectSlug;

  if (objectName) {
    objectSlug = makeSlug(objectName);
  } else {
    objectSlug = makeSlug(objectId);
  }

  var unique = cuid.slug();

  var split = orig.split('.');
  var extension = split.slice(-1)[0];

  // Construct the name
  var name = uploadDir + '/' + surveyId + '/' +
    year + '-' + month + '-' + date +
    '-' + objectSlug +
    '-' + unique +
    '.' + extension;

  return name;
}


/**
 * Save a list of responses
 * @param  {Array}  data The list of responses
 */
function saveResponses(res, data, surveyId) {
  async.map(data, function (item, next) {
    var object_id = item.object_id;
    if (!object_id && item.parcel_id) {
      object_id = item.parcel_id;
    }


    // SWOP HOTFIX
    // Intended to fix one overlapping parcel
    if(surveyId === '06a311f0-4b1a-11e3-aca4-1bb74719513f' &&
      object_id === '865961') {

      console.log('warning at=responses event=fixing_geometry geometry=\'' + JSON.stringify(item.geo_info.geometry) + '\'');

      item.geo_info.geometry.coordinates = [[
          [
            [
              -87.70179480314255,
              41.778884812741445
            ],
            [
              -87.70179480314254,
              41.77865879187205
            ],
            [
              -87.7016633749008,
              41.77866479243637
            ],
            [
              -87.7016633749007,
              41.778698795623754
            ],
            [
              -87.70161241292953,
              41.77870279599755
            ],
            [
              -87.70162850618362,
              41.778884812741434
            ],
            [
              -87.70179480314255,
              41.778884812741445
            ]
          ]
        ]];
    }


    // Gary Hotfix
    if(surveyId === '8a340df0-87af-11e2-9485-c3fff44e7c8e' &&
      object_id === '45-05-31-278-018.000-004') {

      console.log('warning at=responses event=fixing_geometry geometry=\'' + JSON.stringify(item.geo_info.geometry) + '\'');
      item.geo_info.geometry.coordinates = [[
          [
            [
              -87.264351102372,
              41.616613769454
            ],
            [
              -87.26438015699387,
              41.616605371229625
            ],
            [
              -87.26459741592407,
              41.61698435945366
            ],
            [
              -87.2645681559756,
              41.6169918072978
            ],
            [
              -87.264351102372,
              41.616613769454
            ]
          ]
        ]];
    }


    // Gary Hotfix for 730 N Lake St, Gary, IN 46403
    if(surveyId === '8a340df0-87af-11e2-9485-c3fff44e7c8e' &&
      object_id === '45-05-31-252-016.000-004') {

      console.log('warning at=responses event=fixing_geometry geometry=\'' + JSON.stringify(item.geo_info.geometry) + '\'');
      item.geo_info.geometry.coordinates = [[
          [
            [
              -87.2688861836486,
              41.6168866136679
            ],
            [
              -87.26888626813887,
              41.61687006165238
            ],
            [
              -87.26920008659363,
              41.6168720668787
            ],
            [
              -87.2691993481646,
              41.6168879193789
            ],
            [
              -87.269082323718,
              41.6168888225343
            ],
            [
              -87.2688861836486,
              41.6168866136679
            ]
          ]
        ]];
    }


    // Gary Hotfix for 1371 Burr, Gary, IN 46403
    if(surveyId === '8a340df0-87af-11e2-9485-c3fff44e7c8e' &&
      object_id === '45-07-12-255-010.000-004') {

      console.log('warning at=responses event=fixing_geometry geometry=\'' + JSON.stringify(item.geo_info.geometry) + '\'');
      item.geo_info.geometry.coordinates = [[
          [
            [
              -87.4028181409682,
              41.5884758506201
            ],
            [
              -87.40281701087952,
              41.58844974534086
            ],
            [
              -87.40336418151855,
              41.58845375756019
            ],
            [
              -87.4033648081685,
              41.5884794895368
            ],
            [
              -87.4028181409682,
              41.5884758506201
            ]
          ]
        ]];
    }



    // Toledo hotfix. We're mishandling a multipolygon with a very narrow ring.
    if (surveyId === '6acc7f20-a31e-11e3-b7cb-3f5b125a9d0e' &&
        object_id === '01030006') {
      console.log('warning at=responses event=fixing_geometry geometry=\'' + JSON.stringify(item.geo_info.geometry) + '\'');
      item.geo_info.geometry.coordinates = [[
        [
          [
            -83.5234351207036,
            41.6574397653712
          ],
          [
            -83.5234369640415,
            41.6574388754779
          ],
          [
            -83.5234787306227,
            41.657488442051
          ],
          [
            -83.5234992767028,
            41.6575128200531
          ],
          [
            -83.5234974179741,
            41.6575137009344
          ],
          [
            -83.523540216299,
            41.6575644911487
          ],
          [
            -83.5235962927203,
            41.6576310414896
          ],
          [
            -83.523550759221,
            41.6576525796063
          ],
          [
            -83.523447679883,
            41.6577013420163
          ],
          [
            -83.5233424873385,
            41.6577511040926
          ],
          [
            -83.5232877473296,
            41.657686533934
          ],
          [
            -83.5232239256204,
            41.6576112554295
          ],
          [
            -83.5231821794445,
            41.6575620110689
          ],
          [
            -83.5234351207036,
            41.6574397653712
          ]
        ]
      ]];
    }


    // Toledo hotfix near 4246 Northcroft Ln, Toledo, OH 43611
    if (surveyId === '6acc7f20-a31e-11e3-b7cb-3f5b125a9d0e' &&
        object_id === '10245056') {
      console.log('warning at=responses event=fixing_geometry geometry=\'' + JSON.stringify(item.geo_info.geometry) + '\'');
      item.geo_info.geometry.coordinates = [[
        [
            [
              -83.50043088197708,
              41.69899588802351
            ],
            [
              -83.50065350532532,
              41.69899188268154
            ],
            [
              -83.5006523418422,
              41.6990084398991
            ],
            [
              -83.5006492577923,
              41.6990085144476
            ],
            [
              -83.5004314883124,
              41.6990137282662
            ],
            [
              -83.50043088197708,
              41.69899588802351
            ]
          ]
      ]];
    }


    // Toledo hotfix. We're mishandling a multipolygon with a very narrow ring.
    if (surveyId === '6acc7f20-a31e-11e3-b7cb-3f5b125a9d0e' &&
        object_id === '10025017') {
      console.log('warning at=responses event=fixing_geometry geometry=\'' + JSON.stringify(item.geo_info.geometry) + '\'');
      item.geo_info.geometry.coordinates = [[
        [
           [
              -83.4556594491005,
              41.72977758031114
            ],
            [
              -83.455665516206,
              41.7299189632773
            ],
            [
              -83.4556058049202,
              41.72991970171083
            ],
            [
              -83.45559775829315,
              41.72977958202318
            ],
            [
              -83.4556594491005,
              41.72977758031114
            ]
        ]
      ]];
    }

    var response = new Response({
      properties: {
        survey: surveyId,
        humanReadableName: item.geo_info.humanReadableName,
        object_id: object_id,
        centroid: item.geo_info.centroid,
        info: item.info,
        entries: []
      },
      geometry: item.geo_info.geometry
    });

    var entry = {
      source: item.source,
      responses: item.responses
    };
    var entryId;

    // Add file paths, if any
    if (item.files !== undefined) {
      console.log('info at=add_files count=' + item.files.length);
      entry.files = item.files;
    }

    response.entries.push(entry);
    entryId = response.entries[response.entries.length - 1]._id;

    function finish(error, doc) {
      if (error) { return next(error); }
      next(null, formatForAPI(doc.getSingleEntry(entryId)));
    }

    if (object_id) {
      // If there's an object_id field, then we issue an upsert, since we might
      // need to modify an existing document with the new entry.

      // Execute the pre-save middleware, which does not happen for
      // Model.update calls.
      response.applyPreSave(function (error) {
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
          Response.findOne(query, finish);
        });
      });
    } else {
      // If there's no object_id, then each Response doc has only one Entry
      // subdoc.
      response.save(finish);
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
    res.send(201, { responses: docs });
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
      // Generate a name for the file. We use a collision-resistant name so
      // that we can just send the file to S3 without worrying about
      // overwriting another object.
      var fileName;
      try {
        fileName = makeFilename(file.name, surveyId, data[0].geo_info.humanReadableName, data[0].object_id);
      } catch (e) {
        return callback(e);
      }

      console.log('info at=responses event=saving_file name=' + fileName);

      // Save the file to S3
      client.putFile(file.path, fileName, function (error, response) {
        if (error) {
          callback(error);
          return;
        }
        if (200 === response.statusCode) {
          console.log('info at=responses event=saved_file url=' + uploadPrefix + fileName);
          savedFilePaths.push(uploadPrefix + fileName);
          callback();
        } else {
          callback(new Error('Received status code ' + response.statusCode + ' trying to save a file to S3'));
        }
      });
    }, function callback(error) {
      if (error) {
        if (error.name === 'FileNamingError') {
          res.send(400, error);
        } else {
          console.log(error);
          res.send(500);
        }
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

// Redirect the client to a signed S3 URL for the export file.
function sendExport(name, res) {
  var url = exportClient.signedUrl(name, new Date(Date.now() + 5*60*1000));
  res.send({ href: url });
}


// TODO: store cache headers with the export file, so we can compare against
// the data and avoid regenerating unneccesarily.
// TODO: send appropriate headers with a 202 Accepted response to discourage
// caching (although we still ought to add a cache-buster query param on the
// client end)
function handleExport(req, res, type) {
  var surveyId = req.params.surveyId;
  var latest = req.query.latest;
  var timezone = req.query.timezone;
  var open = true; // is this a public export?

  // Check if we've recently generated a shapefile
  Survey.findOne({ id: surveyId }, 'slug exports users').exec(function (error, doc) {
    if (util.handleError(error, res)) { return; }

    if (!doc) {
      res.send(404);
      return;
    }

    var name = settings.exportDir + '/' + doc.slug;
    if (latest) {
      name += '-latest-only';
    }

    if (req.user && _.contains(doc.users, req.user._id)) {
      open = false;
    }

    if (open) {
      name += '-public';
    }

    if (type === 'csv') {
      name += '.csv';
    } else if (type === 'kml') {
      name += '.kml';
    } else if (type === 'shapefile') {
      name += '.zip';
    }


    function generate(removeStale) {
      var update = {
        $set: {}
      };
      update.$set['exports.' + type + '.requested'] = new Date();

      async.series([
        function (next) {
          if (!removeStale) { return next(); }
          // Remove a stale export
          exportClient.deleteFile(name, function (error, response) {
            if (error) { return next(error); }
            console.log('info at=export event=deleted_export');
            response.resume();
            next();
          });
        },
        // Kick off the export task
        tasks.startExport.bind(null, {
          survey: surveyId,
          latest: latest,
          open: open,
          timezone: timezone,
          key: name,
          name: doc.slug,
          bucket: settings.exportBucket,
          type: type
        }),
        doc.update.bind(doc, update),
        function (next) {
          // Send a 202, indicating that we are processing the request, and the
          // client should check back.
          res.send(202);
          next();
        }
      ], function (error) {
        util.handleError(error, res);
      });
    }

    var now = Date.now();

    // See if we have kicked off an export.
    if (!doc.exports || !doc.exports[type]) {
      console.log('info at=export event=generate reason=no_export');
      generate();
      return;
    }

    var metadata = doc.exports[type];

    // See when we kicked off the export. If it was a long time ago, then we need to kick off a background task.
    if (metadata.requested < now - exportDuration) {
      console.log(util.format('info at=export event=generate reason=stale_metadata request_time=%d now=%d export_duration=%d', metadata.requested, now, exportDuration));
      generate();
      return;
    }

    // See if the export has actually been generated.
    exportClient.headFile(name, function (error, head) {
      if (util.handleError(error, res)) { return; }
      head.resume();
      if (head.statusCode === 404) {
        if (metadata.requested > now - exportRequestDuration) {
          // If the file doesn't exist, but we requested it recently, then tell
          // the client to wait.
          res.send(202);
          console.log(util.format('info at=export event=202 reason=waiting_on_export request_time=%d now=%d request_duration=%d', metadata.requested, now, exportRequestDuration));
        } else {
          // If the file doesn't exist, and we requested it a while ago, then
          // kick off a background task.
          console.log(util.format('info at=export event=generate reason=stale_request request_time=%d now=%d request_duration=%d', metadata.requested, now, exportRequestDuration));
          generate();
        }
        return;
      }

      if (head.statusCode !== 200) {
        console.log(util.format('error at=export issue=unexpected_s3_status status_code=%d export_name=%s', head.statusCode, name));
        res.send(500);
        return;
      }

      var lastModifiedText = head.headers['last-modified'];
      var lastModified = new Date(lastModifiedText);
      // If the file exists and is old, kick off a background task.
      if (!lastModifiedText || lastModified < now - exportDuration || lastModified < metadata.requested) {
        console.log(util.format('info at=export event=generate reason=stale_export export_time=%d now=%d export_duration=%d', lastModified, now, exportDuration));
        generate(true);
        return;
      }
      // The file exists and is recent, so we redirect to it.
      sendExport(name, res);
    }).end();
  });
}

exports.handleCSV = function handleCSV(req, res) {
  handleExport(req, res, 'csv');
};

exports.handleShapefile = function handleShapefile(req, res) {
  handleExport(req, res, 'shapefile');
};

exports.handleKML = function handleKML(req, res) {
  handleExport(req, res, 'kml');
};
