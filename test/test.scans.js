/*jslint node: true */
/*globals suite, test, setup, suiteSetup, suiteTeardown, done, teardown */
'use strict';

var server = require('../web.js');
var util = require('util');
var request = require('request');
var should = require('should');
var fs = require('fs');
var crypto = require('crypto');

var settings = require('../settings-test.js');

var BASEURL = 'http://localhost:' + settings.port;

var scannedFile = 'test/data/scan.jpeg';

suite('Scans', function () {
  var surveyId = '123';

  suiteSetup(function (done) {
    server.run(settings, done);
  });

  suiteTeardown(function () {
    server.stop();
  });



  suite('GET', function () {
    var id;
    var digest;
    var name;
    var mimeType;

    suiteSetup(function (done) {
      var hash = crypto.createHash('md5');

      fs.createReadStream(scannedFile)
      .on('data', function (data) {
        hash.update(data);
      })
      .on('end', function () {
        digest = hash.digest('hex');
        done();
      });
    });

    setup(function (done) {
      name = 'scan.jpeg';
      mimeType = 'image/jpeg';

      this.timeout(25000);

      fs.createReadStream(scannedFile).pipe(request.post({
        url: BASEURL + '/surveys/' + surveyId + '/scans',
        headers: { 'x-file-name': name, 'x-mime-type': mimeType }
      }, function (error, response, body) {
        if (error) { return done(error); }
        id = JSON.parse(body).id;
        done();
      }));
    });

    test('Get a scanned image', function (done) {
      this.timeout(25000);
      var hash = crypto.createHash('md5');
      request({
        url: BASEURL + '/' + settings.s3_dir + '/' + id,
        encoding: null
      }, function (error, response, body) {
        hash.update(body);
        var newDigest = hash.digest('hex');
        newDigest.should.equal(digest);
        done();
      });
    });

    test('Get data for a scanned form', function (done) {
      request({url: BASEURL + '/surveys/' + surveyId + '/scans/' + id},
              function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(200);
        response.should.be.json;

        var parsed = JSON.parse(body);
        parsed.scan.should.have.property('id');
        parsed.scan.id.should.equal(id);
        parsed.scan.should.have.property('survey');
        parsed.scan.survey.should.equal(surveyId);
        parsed.scan.should.have.property('filename');
        parsed.scan.filename.should.equal(name);
        parsed.scan.should.have.property('mimetype');
        parsed.scan.mimetype.should.equal(mimeType);
        parsed.scan.should.have.property('url');
        parsed.scan.should.have.property('status');
        parsed.scan.should.have.property('created');

        done();
      });
    });
  });

  suite('POST', function () {
    test('Upload a scanned form', function (done) {
      this.timeout(10000);
      var name = 'scan.jpeg';
      fs.createReadStream(scannedFile).pipe(request.post({
        url: BASEURL + '/surveys/' + surveyId + '/scans',
        headers: { 'x-file-name': name, 'x-mime-type': 'image/jpeg' }
      }, function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(201);
        response.should.be.json;

        var parsed = JSON.parse(body);
        parsed.should.have.property('success');
        parsed.success.should.equal('true');
        parsed.should.have.property('name');
        parsed.name.should.equal(settings.s3_dir + '/' + name);
        parsed.should.have.property('id');

        done();
      }));
    });
  });

  suite('PUT', function () {
    var id;

    suiteSetup(function (done) {
      var name = 'scan.jpeg';
      var mimeType = 'image/jpeg';

      this.timeout(25000);

      fs.createReadStream(scannedFile)
      .pipe(request.post({
        url: BASEURL + '/surveys/' + surveyId + '/scans',
        headers: { 'x-file-name': name, 'x-mime-type': mimeType }
      }, function (error, response, body) {
        if (error) { return done(error); }
        id = JSON.parse(body).id;
        done();
      }));
    });

    test('Set status to "working"', function (done) {
      request.put({
        url: BASEURL + '/surveys/' + surveyId + '/scans/' + id,
        json: {scan: {status: 'working'}}
      }, function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(200);
        response.should.be.json;

        body.should.have.property('scan');
        body.scan.should.have.property('id');
        body.scan.id.should.equal(id);
        body.scan.should.have.property('status');
        body.scan.status.should.equal('working');

        done();
      });
    });

    test('Set status to "complete"', function (done) {
      request.put({
        url: BASEURL + '/surveys/' + surveyId + '/scans/' + id,
        json: {scan: {status: 'complete'}}
      }, function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(200);
        response.should.be.json;

        body.should.have.property('scan');
        body.scan.should.have.property('id');
        body.scan.id.should.equal(id);
        body.scan.should.have.property('status');
        body.scan.status.should.equal('complete');

        done();
      });
    });

    test('Set status to "pending"', function (done) {
      request.put({
        url: BASEURL + '/surveys/' + surveyId + '/scans/' + id,
        json: {scan: {status: 'pending'}}
      }, function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(200);
        response.should.be.json;

        body.should.have.property('scan');
        body.scan.should.have.property('id');
        body.scan.id.should.equal(id);
        body.scan.should.have.property('status');
        body.scan.status.should.equal('pending');

        done();
      });
    });
  });

  suite('DEL', function () {
    var id;

    suiteSetup(function (done) {
      var name = 'scan.jpeg';
      var mimeType = 'image/jpeg';

      this.timeout(25000);

      fs.createReadStream(scannedFile)
      .pipe(request.post({
        url: BASEURL + '/surveys/' + surveyId + '/scans',
        headers: { 'x-file-name': name, 'x-mime-type': mimeType }
      }, function (error, response, body) {
        if (error) { return done(error); }
        id = JSON.parse(body).id;
        done();
      }));
    });

    test('Delete data for a scanned form', function (done) {
      request.del({
        url: BASEURL + '/surveys/' + surveyId + '/scans/' + id
      }, function (error, response, body) {
        should.not.exist(error);
        response.statusCode.should.equal(200);
        response.should.be.json;

        var parsed = JSON.parse(body);
        parsed.should.have.property('count');
        parsed.count.should.equal(1);

        done();
      });
    });
  });
});
