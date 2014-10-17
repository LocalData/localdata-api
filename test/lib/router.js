/*jslint node: true */
'use strict';

var http = require('http');
var https = require('https');
var fs = require('fs');
var httpProxy = require('http-proxy');

var settings = require('../../settings');
var server = require('../../lib/server');

var key = fs.readFileSync(__dirname + '/../data/test-key.pem', 'utf8');
var cert = fs.readFileSync(__dirname + '/../data/test-cert.pem', 'utf8');

var proxy = new httpProxy.HttpProxy({
  target: {
    host: 'localhost', 
    port: settings.port
  }
});

// Suppress info logs, so we can focus on test progress and errors.
var log = console.log;
console.log = function (str) {
  if (typeof str === 'string') {
    if (str.indexOf('info') !== 0) {
      log.apply(console, arguments);
    }
  } else {
    log.apply(console, arguments);
  }
};

var router;
module.exports = {
  run: function start(done) {
    // Start the real server.
    server.run(function (error) {
      if (error) { return done(error); }

      // Start the HTTPS router.
      router = https.createServer({
        key: key,
        cert: cert
      }, function (req, res) {
        proxy.proxyRequest(req, res);
      }).listen(settings.testSecurePort, function (error) {
        console.log('info at=test_https_router event=listening port=' + settings.testSecurePort);
        done(error);
      });
    });
  },
  stop: function stop(done) {
    router.close();
    server.stop(done);
  }
};
