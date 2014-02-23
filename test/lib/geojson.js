/*jslint node: true */
'use strict';

/*
 * Test helpers for GeoJSON types.
 */

var should = require('should');

// Confirm that an item is a GeoJSON MultiPolygon geometry
exports.shouldBeMultiPolygon = function shouldBeMultiPolygon(item) {
  item.should.have.property('type');
  item.type.should.equal('MultiPolygon');
  item.should.have.property('coordinates');
  item.coordinates.should.be.an.instanceOf(Array);
  var i;
  for (i = 0; i < item.coordinates.length; i += 1) {
    item.coordinates[i].should.be.an.instanceOf(Array);
  }
};

// Confirm that an item is a GeoJSON Polygon geometry
exports.shouldBePolygon = function shouldBePolygon(item) {
  item.should.have.property('type');
  item.type.should.equal('Polygon');
  item.should.have.property('coordinates');
  item.coordinates.should.be.an.instanceOf(Array);
  var i;
  for (i = 0; i < item.coordinates.length; i += 1) {
    item.coordinates[i].should.be.an.instanceOf(Array);
  }
};

// Confirm that an item is a GeoJSON Point geometry
exports.shouldBePoint = function shouldBePoint(item) {
  item.should.have.property('type');
  item.type.should.equal('Point');
  item.should.have.property('coordinates');
  item.coordinates.should.be.an.instanceOf(Array);
  var i;
  for (i = 0; i < item.coordinates.length; i += 1) {
    item.coordinates[i].should.be.a.Number;
  }
};

// Confirm that an item is a GeoJSON Feature object
exports.shouldBeFeature = function shouldBeFeature(item) {
  item.should.have.property('type');
  item.type.should.equal('Feature');
  item.should.have.property('geometry');
  item.should.have.property('properties');
};

// Confirm that an item is a GeoJSON FeatureCollection object
exports.shouldBeFeatureCollection = function shouldBeFeatureCollection(item) {
  item.should.have.property('type');
  item.type.should.equal('FeatureCollection');
  item.should.have.property('features');
  item.features.should.be.an.instanceOf(Array);
  item.features.forEach(exports.shouldBeFeature);
};
