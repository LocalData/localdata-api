/*jslint node: true */
'use strict';

var http = require('http');
var express = require('express');
var mongo = require('mongodb');
var uuid = require('node-uuid');
var fs = require('fs');
var s3 = require('connect-s3');

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

var server;
var app = express(express.logger());
var db;

// IE 8 and 9 can't post application/json for cross-origin requests, so we
// accept text/plain treat it as JSON.
// TODO: if we need to accept text/plain in the future, then we need to adjust
// this
function textParser(req, res, next) {
  if (req._body) { return next(); }
  req.body = req.body || {};

  // For GET/HEAD, there's no body to parse.
  if ('GET' === req.method || 'HEAD' === req.method) { return next(); }

  // Check for text/plain content type
  var type = req.headers['content-type'];
  if (type === undefined || 'text/plain' !== type.split(';')[0]) { return next(); }

  // Flag as parsed
  req._body = true;

  console.log('Got text/plain');

  // Parse as JSON
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
      next();
    } catch (err) {
      err.status = 400;
      next(err);
    }
  });
}

app.set('jsonp callback', true);
app.use(express.methodOverride());

app.use(textParser);

// Default to text/plain if no content-type was provided.
app.use(function(req, res, next) {
  if (req.body) { return next(); }
  if ('GET' === req.method || 'HEAD' === req.method) { return next(); }

  if (!req.headers['content-type']) {
    req.body = {};
    textParser(req, res, next);
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

// ID generator
var idgen = uuid.v1;

// Local static files
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

// Set up routes
function setupRoutes(db, settings) {
  forms.setup(app, db, idgen, FORMS);
  responses.setup(app, db, idgen, RESPONSES);
  collectors.setup(app, db, idgen, COLLECTORS);
  surveys.setup(app, db, idgen, SURVEYS);
  scans.setup(app, db, idgen, SCANIMAGES, settings);
  parcels.setup(app, settings);

  // Mobile collection app
  app.use(s3({
    pathPrefix: '/mobile',
    remotePrefix: settings.mobilePrefix
  }));

  // Ringleader's administration/dashboard app
  app.use(s3({
    pathPrefix: '/',
    remotePrefix: settings.adminPrefix
  }));

  // Internal operational management app
  // TODO: move this to S3
  var opsPrefix = '/ops';
  app.use(function (req, res, next) {
    var path;
    var url = req.url;

    if (url.length < opsPrefix.length ||
       url.substr(0, opsPrefix.length) !== opsPrefix) {
      return next();
    }

    path = url.substr(opsPrefix.length);
    if (path === '' || path === '/') {
      res.redirect('/static/surveys.html');
      res.statusCode = 302;
      res.setHeader('Location', req.url + '/');
      res.end();
    } else {
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

      sendFile(res, path, type);
    }
  });
}

// Ensure certain database structure.
function ensureStructure(db, callback) {
  // Map f(callback) to f(error, callback)
  function upgrade(g) {
    return function (err, done) {
      if (err) { callback(err); }
      g(done);
    };
  }

  // Chain async function calls
  function chain (arr) {
    return arr.reduce(function (memo, f, index) {
      return function (err) {
        upgrade(f)(err, memo);
      };
    }, function (e) { callback(e); });
  }

  function ensureResponses(done) {
    db.collection(RESPONSES, function (error, collection) {
      if (error) { throw error; }
      // Ensure we have a geo index on the centroid field.
      collection.ensureIndex({'geo_info.centroid': '2d'}, function (error) {
        done(error);
      });
    });
  }

  function ensureSurveys(done) {
    db.collection(SURVEYS, function (error, collection) {
      if (error) { throw error; }
      // Index the slug field.
      collection.ensureIndex('slug', function (error, index) {
        if (error) { return done(error); }
        // Index the survey ID.
        collection.ensureIndex('id', function (error, index) {
          done(error);
        });
      });
    });
  }

  function ensureSlugs(done) {
    db.collection(SURVEYS, function (error, collection) {
      // Look for surveys with no slug
      collection.find({}, function(err, cursor) {
        cursor.toArray(function (err, arr) {
          if (err) { return done(err); }
          var count = 0;
          arr.forEach(function (item) {
            if (item.slug === undefined) {
              // Add a slug
              surveys.checkSlug(collection, item.name, 0, function (err, slug) {
                if (err) { return done(err); }
                // Update entry
                collection.update({_id: item._id}, {'$set': {slug: slug}}, function (error) {
                  if (err) { return done(err); }
                  count += 1;
                  if (count === arr.length) {
                    done();
                  }
                });
              });
            } else {
              count += 1;
              if (count === arr.length) {
                done();
              }
            }
          });
        });
      });
    });
  }

  chain([ensureSlugs, ensureSurveys, ensureResponses])();
}

function startServer(port, cb) {  
  server = http.createServer(app);
  server.listen(port, function (err) {
    console.log('Listening on ' + port);
    if (cb !== undefined) { cb(err); }
  });
}

function run(settings, cb) {
  if (!db) {
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
    db = new mongo.Db(settings.mongo_db, new mongo.Server(settings.mongo_host,
                                                          settings.mongo_port,
                                                          {}), {});
    setupRoutes(db, settings);
  }

  // Kick things off
  db.open(function() {
    if (settings.mongo_user !== undefined) {
      db.authenticate(settings.mongo_user, settings.mongo_password, function(err, result) {
        if (err) {
          console.log(err.message);
          return cb(err);
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
  server.close();
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
