/*jslint node: true */
'use strict';

var redis = require('redis');

var config = require('../../settings');

var client = module.exports = redis.createClient(config.redisPort, config.redisHost, {
  auth_pass: config.redisPassword
});

client.on('connect', function () {
  console.log('info at=redis_client event=connected host=' + config.redisHost + ':' + config.redisPort);
});

client.on('error', function (error) {
  console.log('error at=redis_client', error);
});

