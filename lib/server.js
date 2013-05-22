/*jslint node: true */
'use strict';

if (process.env.NODEFLY_KEY) {
  require('nodefly').profile(
    process.env.NODEFLY_KEY,
    ['localdata-api', process.env.NODEFLY_LOC]
  );
} else {
  console.log('Skipping NodeFly instrumentation.');
}

var http = require('http');
var express = require('express');
var mongoose = require('mongoose');
var MongoStore = require('connect-mongo')(express);
var uuid = require('node-uuid');
var s3 = require('connect-s3');
var passport = require('passport');

var routes = require('./routes');
var postgres = require('./postgres');

// Basic app variables
var server;
var app = express();
var db = null;

// ID generator
var idgen = uuid.v1;

// Specify logging through an environment variable, so we can log differently
// locally, on dev/test Heroku apps, and on production Heroku apps.
if (process.env.EXPRESS_LOGGER) {
  app.use(express.logger(process.env.EXPRESS_LOGGER));
}

// Have Express wrap the response in a function for JSONP requests
// https://github.com/visionmedia/express/issues/664
app.set('jsonp callback', true);

// Use a compact JSON representation
app.set('json spaces', 0);

// Allows clients to simulate DELETE and PUT
// (some clients don't support those verbs)
// http://stackoverflow.com/questions/8378338/what-does-connect-js-methodoverride-do
app.use(express.methodOverride());

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

  // Parse text/plain as if it was JSON
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

// Actually have Express parse text/plain as JSON
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

app.use(express.json());
app.use(express.urlencoded());

// Keep extensions, so we can properly guess MIME types later.
// TODO: We should get the MIME type from the upload headers.
app.use(express.multipart({
  keepExtensions: true
}));

// Let's compress everything!
app.use(express.compress());

// Add common headers
app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Mime-Type, X-Requested-With, X-File-Name, Content-Type");
  next();
});


function setupAuth(settings, db) {
  // Authentication-related middleware
  app.use(express.cookieParser());
  app.use(express.session({
    secret: settings.secret,
    store: new MongoStore({
      db: settings.mongo_db,
      mongoose_connection: db,
      maxAge: 300000
      // collection: 'sessions' [default]
    })
  }));

  // Initialize Passport. Also use passport.session() middleware, to support
  // persistent login sessions (recommended).
  app.use(passport.initialize());
  app.use(passport.session());
}

function setupRoutes(settings) {
  routes.setup(app, settings);

  // Serve the mobile collection app from /mobile
  app.use(s3({
    pathPrefix: '/mobile',
    remotePrefix: settings.mobilePrefix
  }));

  // Serve the ringleader's administration/dashboard app from /
  app.use(s3({
    pathPrefix: '/',
    remotePrefix: settings.adminPrefix
  }));
}

// We're done with our preflight stuff.
// Now, we start listening for requests.
function startServer(port, cb) {
  server = http.createServer(app);
  server.listen(port, function (err) {
    console.log('Listening on ' + port);
    if (cb !== undefined) { cb(err); }
  });
}

function run(settings, cb) {
  // Set up the database object
  if (db === null || db.readyState === 0) {
    if (db !== null) {
      db.removeAllListeners();
    }

    console.log('Using the following settings:');
    console.log('Port: ' + settings.port);
    console.log('Mongo host: ' + settings.mongo_host);
    console.log('Mongo port: ' + settings.mongo_port);
    console.log('Mongo db: ' + settings.mongo_db);
    console.log('Mongo user: ' + settings.mongo_user);
    console.log('Postgresql host: ' + settings.psqlHost);
    console.log('Postgresql db: ' + settings.psqlName);
    console.log('Postgresql user: ' + settings.psqlUser);

    var opts = {
      db: {
        w: 1,
        safe: true,
        native_parser: settings.mongo_native_parser
      },
      server: {
        socketOptions: {
          // If we attempt to connect for 45 seconds, stop.
          connectTimeoutMS: 45000,
          keepAlive: 1
        }
      }
    };

    if (settings.mongo_user !== undefined) {
      opts.user = settings.mongo_user;
      opts.pass = settings.mongo_password;
    }

    mongoose.connect(settings.mongo_host, settings.mongo_db, settings.mongo_port, opts);
    postgres.setup(settings);

    db = mongoose.connection;

    db.on('error', function (error) {
      console.log('Error connecting to MongoDB server:');
      console.log(error);
      throw error;
    });

    db.on('disconnected', function () {
      console.log('Error: we have been disconnected from the MongoDB server.');
    });

    db.on('reconnected', function () {
      console.log('We have reconnected to the MongoDB server.');
    });

    db.once('open', function () {
      setupAuth(settings, db);
      setupRoutes(settings); // Needs to happen AFTER setupAuth
      startServer(settings.port, cb);
    });
  }
}

function stop(done) {
  server.close();
  postgres.close();
  db.close(function () {
    console.log('Stopped server');
    if (done) { return done(); }
  });
}

module.exports = {
  run: run,
  stop: stop
};

// If this was run directly, run!
if (require.main === module) {
  run(require('./settings.js'));
}
