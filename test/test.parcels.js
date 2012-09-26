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
  item.polygon.should.have.property('type');
  item.polygon.type.should.equal('MultiPolygon');
  item.polygon.should.have.property('coordinates');
  item.polygon.coordinates.should.be.an.instanceOf(Array);
  item.should.have.property('address');
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
        response.should.be.json

        var parsed = JSON.parse(body);
        parsed.should.be.an.instanceOf(Array);
        parsed.should.have.lengthOf(0);

        done();
      });
    });
  });
});

