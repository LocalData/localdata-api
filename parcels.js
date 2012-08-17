/*jslint node: true */
'use strict';

/*
 * ==================================================
 * Parcels
 * ==================================================
 * 
 * Serves parcel data from the geo database.
 */

var pg = require('pg');

var client = null;

function bboxToPolygon(bbox) {
  var polygon = 'POLYGON((' +
                bbox[0] + ' ' + bbox[1] + ', ' +
                bbox[0] + ' ' + bbox[3] + ', ' +
                bbox[2] + ' ' + bbox[3] + ', ' +
                bbox[2] + ' ' + bbox[1] + ', ' +
                bbox[0] + ' ' + bbox[1] + '))';
  return polygon;
}


/*
 * app: express server
 */
function setup(app, settings) {
  var connectionString =
    'tcp://' + settings.psqlUser + ':' + settings.psqlPass +
    '@' + settings.psqlHost + '/' + settings.psqlName;

  if (client === null) {
    client = new pg.Client(connectionString);
    client.connect();
  }

  // Get parcels
  // Filter to include only parcels inside a bounding box or only parcels that
  // intersect a point.
  // We do not allow filtering by both, and we require one of the filters.
  // GET http://localhost:3000/api/parcels?bbox=-{SW_LON},{SW_LAT},{NE_LON},{NE_LAT}
  // GET http://localhost:3000/api/parcels?bbox=-83.0805,42.336,-83.08,42.34
  // GET http://localhost:3000/api/parcels?lon={LONGITUDE}&lat={LATITUDE}
  // GET http://localhost:3000/api/parcels?lon=-83.08076&lat=42.338
  app.get('/api/parcels', function(req, response) {
    var bbox = req.query.bbox;
    var lon = req.query.lon;
    var lat = req.query.lat;
    var query;
    var coordString;
    var coords;
    var output;
    var error;
    var i;

    // Require a filter
    if (bbox === undefined &&
        (lon === undefined || lat === undefined)) {
      response.send(413);
      return;
    }

    if (bbox !== undefined) {
      // Bounding box query

      // Don't allow both filters at once
      if (lon !== undefined || lat !== undefined) {
        response.send(400);
        return;
      }

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

      query = client.query({
        text: 'SELECT parcelnumb, propaddres, proaddress, ST_AsGeoJSON(wkb_geometry) AS polygon, ST_AsGeoJSON(ST_Centroid(wkb_geometry)) AS centroid FROM qgis WHERE ST_Intersects(wkb_geometry, ST_SetSRID($1, 4326))',
        values: [bboxToPolygon(coords)],
        name: 'parcelBBoxQuery'
      });
    } else {
      // Point query

      // Convert coordinates to numbers
      lat = parseFloat(lat);
      lon = parseFloat(lon);

      if (isNaN(lat) || isNaN(lon)) {
        response.send(400);
        return;
      }

      query = client.query({
        text: 'SELECT parcelnumb, propaddres, proaddress, ST_AsGeoJSON(wkb_geometry) AS polygon, ST_AsGeoJSON(ST_Centroid(wkb_geometry)) AS centroid FROM qgis WHERE ST_Contains(wkb_geometry, ST_SetSRID($1, 4326))',
        values: ['POINT(' + lon + ' ' + lat + ')'],
        name: 'parcelPointQuery'
      });
    }

    output = [];
    query
    .on('row', function (row, result) {
      try {
        output.push({
          parcelId: row.parcelnumb.trim(),
          address: row.proaddress.trim(),
          polygon: JSON.parse(row.polygon),
          centroid: JSON.parse(row.centroid)
        });
      } catch (e) {
        error = e;
      }
    })
    .on('error', function (e) {
      console.log(e.message);
      error = e;
    })
    .on('end', function (result) {
      if (error) {
        response.send(500);
      } else {
        response.send(output);
      }
    });
  });
}

module.exports = {
  setup: setup
}
