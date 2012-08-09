/*jslint node: true */
'use strict';

var express = require('express');
var mongo = require('mongodb');
var uuid = require('node-uuid');
var fs = require('fs');

/*
 * Routes are split into separate modules.
 */
var forms = require('./forms');
var responses = require('./responses');
var collectors = require('./collectors');
var surveys = require('./surveys');
var scans = require('./scans');
var parcels = require('./parcels');

var RESPONSES = 'responseCollection';
var FORMS = 'formCollection';
var COLLECTORS = 'collectorCollection';
var SURVEYS = 'surveyCollection';
var SCANIMAGES = 'scanCollection';

var app = express.createServer(express.logger());
var db;

// IE 8 and 9 can't post application/json for cross-origin requests, so we
// accept text/plain treat it as JSON.
// TODO: if we need to accept text/plain in the future, then we need to adjust
// this
function textParser(req, options, callback) {
  console.log('Got text/plain');
  var buf = '';
  req.setEncoding('utf8');
  req.on('data', function(chunk){
    buf += chunk;
  });
  req.on('end', function(){
    try {
      if (!buf.length) {
        req.body = {};
      } else {
        req.body = JSON.parse(buf);
      }
      callback();
    } catch (err) {
      callback(err);
    }
  });
}

express.bodyParser.parse['text/plain'] = textParser;

app.configure(function() {
  app.set('jsonp callback', true);
  app.use(express.methodOverride());

  // Default to text/plain if no content-type was provided.
  app.use(function(req, res, next) {
    if (req.body) { return next(); }
    if ('GET' === req.method || 'HEAD' === req.method) { return next(); }

    if (!req.headers['content-type']) {
      req.body = {};
      textParser(req, null, next);
    } else {
      next();
    }
  });

  app.use(express.bodyParser());

  // Add common headers
  app.use(function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Mime-Type, X-Requested-With, X-File-Name, Content-Type");
    next();
  });
});

// ID generator
var idgen = uuid.v1;

// Set up routes for forms
function setupRoutes(db, settings) {
  forms.setup(app, db, idgen, FORMS);
  responses.setup(app, db, idgen, RESPONSES);
  collectors.setup(app, db, idgen, COLLECTORS);
  surveys.setup(app, db, idgen, SURVEYS);
  scans.setup(app, db, idgen, SCANIMAGES, settings);
  parcels.setup(app, settings);
}

// Ensure certain database structure.
function ensureStructure(db, callback) {
  db.collection(RESPONSES, function (error, collection) {
    if (error) { throw error; }
    collection.ensureIndex({'geo_info.centroid': '2d'}, function (error) {
      callback(error);
    });
  });
}

// Static files
// TODO: host these separately? Shift other routes to /api/ROUTES?
function sendFile(response, filename, type) {
  fs.readFile('static/' + filename, function(err, data) {
    if (err) {
      console.log(err.message);
      response.send(500);
      return;
    }
    response.header('Content-Type', type);
    response.send(data);
  });
}

app.get('/', function(req, response) {
  response.redirect('/static/surveys.html');
});

app.get(/\/static\/(.*)/, function(req, response) {
  var path = req.params[0];
  var index = path.lastIndexOf('.');
  var format = '';
  if (index > -1) {
    format = path.substring(index);
  }

  var type;
  switch (format) {
  case '.html':
    type = 'text/html';
    break;
  case '.css':
    type = 'text/css';
    break;
  case '.js':
    type = 'application/javascript';
    break;
  case '.gif':
    type = 'image/gif';
    break;
  case '.png':
    type = 'image/png';
    break;
  default:
    type = 'text/html';
  }

  sendFile(response, path, type);
});


function startServer(port, cb) {  
  app.listen(port, function(err) {
    console.log('Listening on ' + port);
    if (cb !== undefined) { cb(err); }
  });
}

function run(settings, cb) {
  // Kick things off
  console.log('Using the following settings:');
  console.log('Port: ' + settings.port);
  console.log('Mongo host: ' + settings.mongo_host);
  console.log('Mongo port: ' + settings.mongo_port);
  console.log('Mongo db: ' + settings.mongo_db);
  console.log('Mongo user: ' + settings.mongo_user);
  console.log('Postgresql host: ' + settings.psqlHost);
  console.log('Postgresql db: ' + settings.psqlName);
  console.log('Postgresql user: ' + settings.psqlUser);
  // Set up database
  if (!db) {
    db = new mongo.Db(settings.mongo_db, new mongo.Server(settings.mongo_host,
                                                          settings.mongo_port,
                                                          {}), {});
  }
  setupRoutes(db, settings);
  db.open(function() {
    if (settings.mongo_user !== undefined) {
      db.authenticate(settings.mongo_user, settings.mongo_password, function(err, result) {
        if (err) {
          console.log(err.message);
          return;
        }
        ensureStructure(db, function (error) {
          if (error) { throw error; }
          startServer(settings.port, cb);
        });
      });
    } else {
      ensureStructure(db, function (error) {
        if (error) { throw error; }
        startServer(settings.port, cb);
      });
    }
  });
}

function stop() {
  app.close();
  db.close();
  console.log('Stopped server');
}

module.exports = {
  run: run,
  stop: stop
};

// If this was run directly, run!
if (require.main === module) {
  run(require('./settings.js'));
}
