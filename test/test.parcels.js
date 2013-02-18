/*jslint node: true */
/*globals suite, test, setup, suiteSetup, suiteTeardown, done, teardown */
'use strict';

var server = require('../web.js');
var assert = require('assert');
var util = require('util');
var request = require('request');
var should = require('should');

var settings = require('../settings-test.js');

var BASEURL = 'http://localhost:' + settings.port + '/api';

function shouldBeParcel(item) {
  item.should.have.property('centroid');
  item.centroid.should.have.property('type');
  item.centroid.type.should.equal('Point');
  item.centroid.should.have.property('coordinates');
  item.centroid.coordinates.should.have.lengthOf(2);
  item.should.have.property('parcelId');
  item.should.have.property('polygon');
  item.should.have.property('type');
  item.polygon.should.have.property('type');
  item.polygon.type.should.equal('MultiPolygon');
  item.polygon.should.have.property('coordinates');
  item.polygon.coordinates.should.be.an.instanceOf(Array);
  item.should.have.property('address');
}

// Confirm that an item is a GeoJSON MultiPolygon geometry
function shouldBeMultiPolygon(item) {
  item.should.have.property('type');
  item.type.should.equal('MultiPolygon');
  item.should.have.property('coordinates');
  item.coordinates.should.be.an.instanceOf(Array);
  var i;
  for (i = 0; i < item.coordinates.length; i += 1) {
    item.coordinates[i].should.be.an.instanceOf(Array);
  }
}

// Confirm that an item is a GeoJSON Feature object
function shouldBeFeature(item) {
  item.should.have.property('type');
  item.type.should.equal('Feature');
  item.should.have.property('geometry');
  item.should.have.property('properties');
}

// Confirm that an item is a GeoJSON FeatureCollection object
function shouldBeFeatureCollection(item) {
  item.should.have.property('type');
  item.type.should.equal('FeatureCollection');
  item.should.have.property('features');
  item.features.should.be.an.instanceOf(Array);
  var i;
  for (i = 0; i < item.features.length; i += 1) {
    shouldBeFeature(item.features[i]);
  }
}

suite('Parcels', function () {
  suiteSetup(function (done) {
    server.run(settings, done);
  });

  suiteTeardown(function () {
    server.stop();
  });

  suite('GET', function () {
    test('Get parcels inside a bounding box', function (done) {
      // lower-left longitude, lower-left latitude, upper-right longitude,
      // upper-right latitude
      request({
        url: BASEURL + '/parcels?bbox=-83.0805,42.336,-83.08,42.34'
      }, function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(200);
        response.should.be.json;

        var parsed = JSON.parse(body);
        parsed.length.should.be.above(40);
        var i;
        for (i = 0; i < parsed.length; i += 1) {
          shouldBeParcel(parsed[i]);
        }

        done();
      });
    });

    test('Get GeoJSON parcels inside a bounding box', function (done) {
      // lower-left longitude, lower-left latitude, upper-right longitude,
      // upper-right latitude
      request({
        url: BASEURL + '/parcels.geojson?bbox=-83.0805,42.336,-83.08,42.34'
      }, function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(200);
        response.should.be.json;

        var parsed = JSON.parse(body);
        shouldBeFeatureCollection(parsed);
        parsed.features.length.should.be.above(40);
        var i;
        var feature;
        for (i = 0; i < parsed.features.length; i += 1) {
          feature = parsed.features[i];
          // Parcel ID
          feature.should.have.property('id');
          // Centroid
          feature.properties.should.have.property('centroid');
          feature.properties.centroid.should.have.property('type');
          feature.properties.centroid.type.should.equal('Point');
          feature.properties.centroid.should.have.property('coordinates');
          feature.properties.centroid.coordinates.should.have.lengthOf(2);
          // Address
          feature.properties.should.have.property('address');
        }

        done();
      });
    });

    test('Do not allow unbounded parcel queries', function (done) {
      request({url: BASEURL + '/parcels'}, function (error, response, body) {
        should.not.exist(error);
        // We should get "413 Request Entity Too Large" if we don't specify a
        // bounding box.
        response.statusCode.should.equal(413);

        done();
      });
    });

    test('Get parcels at a point', function (done) {
      request({
        url: BASEURL + '/parcels?lon=-83.08076&lat=42.338'
      }, function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(200);
        response.should.be.json;

        var parsed = JSON.parse(body);
        // Expect an array, since condos could have parcels that overlap.
        parsed.should.be.an.instanceOf(Array);
        parsed.length.should.be.above(0);
        var i;
        for (i = 0; i < parsed.length; i += 1) {
          shouldBeParcel(parsed[i]);
        }

        done();
      });
    });

    test('Do not allow bounding box with lat-lon query', function (done) {
      request({
        url: BASEURL + '/parcels?bbox=-83.0805,42.336,-83.08,42.34&lon=-83.08076&lat=42.338'
      }, function (error, response, body) {
        should.not.exist(error);
        // We should get "400 Bad Request" if we specify both a bounding box
        // and a point.
        response.statusCode.should.equal(400);

        done();
      });
    });

    test('Point query with no results', function (done) {
      // lon=105.436096, lat=-6.152738 is in the water, in Indonesia, so we
      // should not find any parcels.
      request({
        url: BASEURL + '/parcels?lon=105.436096&lat=-6.152738'
      }, function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(200);
        response.should.be.json

        var parsed = JSON.parse(body);
        parsed.should.be.an.instanceOf(Array);
        parsed.should.have.lengthOf(0);

        done();
      });
    });

    test('Bounding box query with no results', function (done) {
      // bounding box 105.43,-6.154,105.44,-6.144 is in the water, in
      // Indonesia, so we should not find any parcels.
      request({
        url: BASEURL + '/parcels?bbox=105.43,-6.154,105.44,-6.144'
      }, function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(200);
        response.should.be.json;

        var parsed = JSON.parse(body);
        parsed.should.be.an.instanceOf(Array);
        parsed.should.have.lengthOf(0);

        done();
      });
    });

    test('ETag and 304 response', function (done) {
      // bounding box -122.431640625,37.77288579232438,-122.42889404296875,37.77505678240507
      // is in San Francisco, so we should find parcels, and the second request
      // should receive a status code 304 response
      var url = BASEURL + '/parcels?bbox=-122.431640625,37.77288579232438,-122.42889404296875,37.77505678240507';
      request({
        url: url
      }, function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(200);
        response.should.be.json;

        var etag = response.headers.etag;
        request({
          url: url,
          headers: {
            'If-None-Match': etag
          }
        }, function (error, response, body) {
          should.not.exist(error);
          response.statusCode.should.equal(304);
          response.headers.etag.should.equal(etag);

          done();
        });
      });
    });

  });
});

