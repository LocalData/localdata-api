/*jslint node: true */
'use strict';

/*
 * ==================================================
 * Geographic base features
 * ==================================================
 *
 * Serves base feature data (parcels, stretlights, etc.) from the geo database.
 */

var getClient = require('../postgres').getClient;
var lru = require('lru-cache');
var crypto = require('crypto');

var cache = lru({
  max: 500,
  maxAge: 1000 * 60 * 60 // 1 hour
});

// Track requests and cache effectiveness
var cacheStats = {
  total: 0,
  etag: 0,
  hits: 0
};

/*
 * Make values returned by the database neater.
 */
function clean(val) {
  if (val === null || val === undefined) {
    return '';
  }
  return val.trim();
}

function bboxToPolygon(bbox) {
  var polygon = 'POLYGON((' +
                bbox[0] + ' ' + bbox[1] + ', ' +
                bbox[0] + ' ' + bbox[3] + ', ' +
                bbox[2] + ' ' + bbox[3] + ', ' +
                bbox[2] + ' ' + bbox[1] + ', ' +
                bbox[0] + ' ' + bbox[1] + '))';
  return polygon;
}


// Cache ETag values, so we can return Not Modified responses without hitting
// the database.
// We assume the base geodata does not change very regularly, that a server
// process does not live more than about a day, and that the load is not
// balanced across many server processes. When the last assumption changes, we
// should use a more sophisticated caching sceme.
exports.useCache = function useCache(req, res, next) {
  cacheStats.total += 1;

  // Remove our universal cache-control header
  res.removeHeader('Cache-Control');

  var etag = req.headers['if-none-match'];

  if (etag !== undefined) {
    cacheStats.etag += 1;

    if (cache.get(req.url) === etag) {
      res.set('ETag', etag);
      res.send(304);

      cacheStats.hits += 1;
    }
    console.log('base-features-etag-cache total=' +
                cacheStats.total +
                ' etag-requests=' + cacheStats.etag +
                ' cache-hit-rate=' +
                cacheStats.hits / cacheStats.etag);
    return;
  }

  var end = res.end;
  res.end = function (body) {
    var etag = this.get('ETag');
    if (etag === undefined) {
      var hash = crypto.createHash('md5');
      hash.update(body);
      etag = '"' + hash.digest('base64') + '"';
      res.set('ETag', etag);
    }
    cache.set(req.url, etag);
    end.call(res, body);
  };

  return next();
};


exports.getById = function getById(req, response) {
  var id = req.params.id;
  var source = req.params.source;
  var queryConfig;

  // Require thie id
  if (id === undefined || source === undefined) {
    response.send(413);
    return;
  }

  queryConfig = {
    text: 'SELECT object_id, short_name AS "shortName", long_name AS "longName", ' +
      'source, type, ST_AsGeoJSON(geom) AS geometry, ST_AsGeoJSON(ST_Centroid(geom::geometry)) AS centroid, info ' +
      'FROM features ' +
      'WHERE object_id = $1' +
      'AND source = $2',
    values: [id, source],
    name: 'featureIdQuery'
  };

  getClient(function (error, client, done) {
    if (error) {
      console.log('postgres database error: ' + error.message);
      console.log(error);
      response.send(500);
      return;
    }

    var query = client.query(queryConfig);

    query
    .on('row', function (row, result) {
      var geometry;
      var info;

      try {
        geometry = JSON.parse(row.geometry);
      } catch (e) {
        console.log('Error parsing geometry: ', e);
        console.log(row.geometry);
        error = e;
        return;
      }

      result.addRow({
        type: 'Feature',
        id: clean(row.object_id),
        geometry: geometry,
        properties: {
          shortName: clean(row.shortName),
          longName: clean(row.longName),
          source: clean(row.source),
          type: clean(row.type),
          info: row.info,
          centroid: JSON.parse(row.centroid)
        }
      });
    })
    .on('error', function (e) {
      console.log(e.message);
      error = e;
    })
    .on('end', function (result) {
      if (error) {
        console.log(error);
        response.send(500);
      } else {
        // If there's no data, we want the client to check back.
        // If there is data, we want the client to use its local cache for a
        // while without hitting the network.
        if (result.rows.length > 0) {
          // 3600 seconds = 1 hour
          response.set('Cache-Control', 'max-age=3600');
        }
        response.send({
          type: 'FeatureCollection',
          features: result.rows
        });
      }
      done();
    });
  });
};

// Get base features as GeoJSON
// Specify a type of feature or a source data set.
// Filter to include only features inside a bounding box or only features that
// intersect a point.
// We do not allow filtering by both, and we require one of the filters.
// GET /api/features?type=parcels,bbox=-{SW_LON},{SW_LAT},{NE_LON},{NE_LAT}
// GET /api/features?type=parcels,bbox=-83.0805,42.336,-83.08,42.34
// GET /api/features?type=parcels,lon={LONGITUDE}&lat={LATITUDE}
// GET /api/features?type=parcels,lon=-83.08076&lat=42.338
// GET /api/features?source=detroit-streetlights,bbox=-{SW_LON},{SW_LAT},{NE_LON},{NE_LAT}
exports.get = function get(req, response) {
  var bbox = req.query.bbox;
  var lon = req.query.lon;
  var lat = req.query.lat;
  var source = req.query.source;
  var type = req.query.type;

  var query;
  var queryConfig;
  var coordString;
  var coords;
  var geometry;
  var error;
  var i;

  // Require a filter
  if (bbox === undefined &&
      (lon === undefined || lat === undefined)) {
    response.send(413);
    return;
  }

  // Don't allow both filters at once
  if (bbox !== undefined &&
      (lon !== undefined || lat !== undefined)) {
    response.send(400);
    return;
  }

  // Require either a type or a source
  if (type === undefined && source === undefined) {
    response.send(400);
    return;
  }

  if (bbox !== undefined) {
    // Bounding box query

    // Split bounding box into coordinates
    coordString = bbox.split(',');

    if (coordString.length !== 4) {
      response.send(400);
      return;
    }

    // Convert coordinates to numbers
    coords = [];
    for (i = 0; i < 4; i += 1) {
      coords[i] = parseFloat(coordString[i]);

      // Make sure the conversion worked
      if (isNaN(coords[i])) {
        response.send(400);
        return;
      }
    }

    geometry = bboxToPolygon(coords);
  } else {
    // Point query

    // Convert coordinates to numbers
    lat = parseFloat(lat);
    lon = parseFloat(lon);

    if (isNaN(lat) || isNaN(lon)) {
      response.send(400);
      return;
    }
    geometry = 'POINT(' + lon + ' ' + lat + ')';

  }

  if (source !== undefined) {
    // Restrict by source data set
    queryConfig = {
      text: 'SELECT object_id, short_name AS "shortName", long_name AS "longName", ' +
        'source, type, ST_AsGeoJSON(geom) AS geometry, ST_AsGeoJSON(ST_Centroid(geom::geometry)) AS centroid, info ' +
        'FROM features ' +
        'WHERE source = $1 AND ST_Intersects(geom, ST_SetSRID($2::text, 4326)) LIMIT 1000',
      values: [source, geometry],
      name: 'featureSourceQuery'
    };
  } else {
    // Restrict by data set type
    queryConfig = {
      text: 'SELECT object_id, short_name AS "shortName", long_name AS "longName", ' +
        'source, type, ST_AsGeoJSON(geom) AS geometry, ST_AsGeoJSON(ST_Centroid(geom::geometry)) AS centroid, info ' +
        'FROM features ' +
        'WHERE type = $1 AND ST_Intersects(geom, ST_SetSRID($2::text, 4326)) LIMIT 1000',
      values: [type, geometry],
      name: 'featureTypeQuery'
    };
  }

  getClient(function (error, client, done) {
    if (error) {
      console.log('postgres database error: ' + error.message);
      console.log(error);
      response.send(500);
      return;
    }

    var query = client.query(queryConfig);

    query
    .on('row', function (row, result) {
      var geometry;
      var info;

      try {
        geometry = JSON.parse(row.geometry);
      } catch (e) {
        console.log('Error parsing geometry: ', e);
        console.log(row.geometry);
        error = e;
        return;
      }

      result.addRow({
        type: 'Feature',
        id: clean(row.object_id),
        geometry: geometry,
        properties: {
          shortName: clean(row.shortName),
          longName: clean(row.longName),
          source: clean(row.source),
          type: clean(row.type),
          info: row.info,
          centroid: JSON.parse(row.centroid)
        }
      });
    })
    .on('error', function (e) {
      console.log(e.message);
      error = e;
    })
    .on('end', function (result) {
      if (error) {
        console.log(error);
        response.send(500);
      } else {
        // If there's no data, we want the client to check back.
        // If there is data, we want the client to use its local cache for a
        // while without hitting the network.
        if (result.rows.length > 0) {
          // 3600 seconds = 1 hour
          response.set('Cache-Control', 'max-age=3600');
        }
        response.send({
          type: 'FeatureCollection',
          features: result.rows
        });
      }
      done();
    });
  });
};

// Get base features as GeoJSON
// Specify a type of feature or a source data set.
// Filter to include only features inside a bounding box or only features that
// intersect a point.
// We do not allow filtering by both, and we require one of the filters.
// GET /api/sources?lon={LONGITUDE}&lat={LATITUDE}
// GET /api/sources?lon=-83.08076&lat=42.338
exports.listSources = function listSources(req, res) {
  var lon = req.query.lon;
  var lat = req.query.lat;

  if ((lat && !lon)  || (!lat && lon)) {
    res.send(400, {
      name: 'BadRequestError',
      message: 'Must specify both lon and lat arguments.'
    });
    return;
  }

  var queryConfig;

  if (!lat && !lon) {
    // Get all of the sources
    queryConfig = {
      text: [
        'SELECT sub.a AS name, sub.b AS type FROM (WITH RECURSIVE t(a,b) AS (',
        'SELECT MIN(source), MIN(type) FROM features',
        'UNION ALL',
        'SELECT (SELECT source FROM features WHERE source > a ORDER BY source LIMIT 1),',
        '(SELECT type FROM features WHERE source > a ORDER BY source LIMIT 1)',
        'FROM t WHERE a IS NOT NULL',
        ')',
        'SELECT t.a,t.b',
        'FROM t',
        'WHERE t.a IS NOT NULL) AS sub'
      ].join('\n'),
      name: 'featureAllSourcesQuery'
    };
  } else {
    // Get the sources near the specified coordinate.
    queryConfig = {
      text: [
        'SELECT sub.a AS name, sub.b as type, sub.id FROM (WITH RECURSIVE t(a,b) AS (',
        'SELECT MIN(source), MIN(type) FROM features',
        'UNION',
        'SELECT (SELECT source FROM features WHERE source > a ORDER BY source LIMIT 1),',
        '(SELECT type FROM features WHERE source > a ORDER BY source LIMIT 1)',
        'FROM t WHERE a IS NOT NULL AND b IS NOT NULL',
        ')',
        'SELECT t.a,t.b, (',
        'SELECT id',
        'FROM features',
        'WHERE ST_Intersects(',
        'geom,',
        'ST_Expand(',
        'ST_SetSRID(ST_Point($1, $2),4326),',
        '.07',
        ')::geography',
        ')',
        'AND source = t.a',
        'LIMIT 1',
        ') AS id',
        'FROM t) AS sub',
        'WHERE sub.id IS NOT NULL'
      ].join('\n'),
      values: [lon, lat],
      name: 'featureNearbySourcesQuery'
    };
  }

  getClient(function (error, client, done) {
    if (error) {
      console.log('postgres database error: ' + error.message);
      console.log(error);
      res.send(500);
      return;
    }

    var query = client.query(queryConfig);

    query
    .on('row', function (row, result) {
      result.addRow({
        name: row.name,
        type: row.type,
        // TODO: When we start using a separate table to organize our sources,
        // we will have a real description field.
        description: ''
      });
    })
    .on('error', function (e) {
      console.log(e.message);
      error = e;
    })
    .on('end', function (result) {
      if (error) {
        console.log(error);
        res.send(500);
      } else {
        res.send({
          sources: result.rows
        });
      }
      done();
    });
  });
};
/*
SELECT sub.a, sub.b, sub.id FROM (WITH RECURSIVE t(a,b) AS (
    SELECT MIN(source), MIN(type) FROM features
  UNION
    SELECT (SELECT source FROM features WHERE source > a ORDER BY source LIMIT 1),
    (SELECT type FROM features WHERE source > a ORDER BY source LIMIT 1)
    FROM t WHERE a IS NOT NULL AND b IS NOT NULL
)
SELECT t.a,t.b, (
    SELECT id
    FROM features
    WHERE ST_Intersects(
        geom,
        ST_Expand(
            ST_SetSRID(ST_Point(-83.04792022705078, 42.33168029785156),4326),
            .07
        )::geography
    )
    AND source = t.a
    LIMIT 1
    ) AS id
FROM t) AS sub
WHERE sub.id IS NOT NULL
;
*/
