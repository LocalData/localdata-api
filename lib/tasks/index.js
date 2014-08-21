/*jslint node: true */
'use strict';

var util = require('util');

var async = require('async');
var nr = require('node-resque');

var redisClient = require('./redis-client');

var resque;

exports.enqueue = function enqueue(queue, jobType, data, done) {
  var queueLength;
  async.series([
    function (next) {
      resque.enqueue(queue, jobType, [data], next);
    },
    function (next) {
      resque.length(queue, function (error, len) {
        queueLength = len;
        next(error);
      });
    }
  ], function (error) {
    if (error) {
      console.log(util.format('error at=enqueue_task queue=%s length=%s type=%s data=%s', queue, queueLength, jobType, JSON.stringify(data)), error);
      return done(error);
    }

    console.log(util.format('event=job_added queue=%s length=%s type=%s data=%s', queue, queueLength, jobType, JSON.stringify(data)));
    done();
  });
};

exports.connect = function connect(done) {
  resque = new nr.queue({
    connection: {
      redis: redisClient
    }
  }, function (error) {
    if (error) {
      console.log('error at=tasks_connect', error);
      return done(error);
    }
    redisClient.on('connect', done);
  });
};

exports.close = function close(done) {
  resque.end(done);
};
