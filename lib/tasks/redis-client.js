/*jslint node: true */
'use strict';

var redis = require('redis');

var config = require('../../settings');

exports.connect = function connect(done) {
  var client;

  client = redis.createClient(config.redisPort, config.redisHost, {
    auth_pass: config.redisPassword
  });

  client.once('connect', function () {
    console.log('info at=redis_client event=connected host=' + config.redisHost + ':' + config.redisPort);
    done(null, client);
  });

  client.on('error', function (error) {
    console.log('error at=redis_client', error);
  });
};

