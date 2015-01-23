/*jslint node: true */
'use strict';

if (process.env.NEW_RELIC_LICENSE_KEY) {
  require('newrelic');
}

var http = require('http');

var _ = require('lodash');
var async = require('async');
var express = require('express');
var MongoStore = require('connect-mongo')(express);
var uuid = require('node-uuid');
var s3 = require('connect-s3');
var passport = require('passport');

var mongo = require('./mongo');
var settings = require('../settings');
var routes = require('./routes');
var postgres = require('./postgres');
var tasks = require('./tasks');

// Basic app variables
var server;
var app = express();
var db = null;

// ID generator
var idgen = uuid.v1;

// Log some information when requests are first received.
if (process.env.REQUEST_LOGGER) {
  app.use(express.logger({
    immediate: true,
    format: process.env.REQUEST_LOGGER
  }));
}

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

// Allow Heroku to handle SSL for us
app.enable('trust proxy');

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

  console.log('info at=text_parser event=received_text/plain');

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

function rawParser(req, res, next) {
  if (req._body) { return next(); }
  req.body = req.body || {};

  // For GET/HEAD, there's no body to parse.
  if ('GET' === req.method || 'HEAD' === req.method) { return next(); }

  // Flag as parsed
  req._body = true;

  var bufs = [];
  var len = 0;
  req.on('data', function(chunk){
    bufs.push(chunk);
    len += chunk.length;
  });
  req.on('end', function(){
    req.body = Buffer.concat(bufs, len);
    next();
  });
}

// Skip parsing the body for requests that we'll proxy to the tileserver
app.use('/tiles', rawParser);

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
  res.header('Cache-Control', 'max-age=0, must-revalidate');
  next();
});

function setupAuth(db) {
  // Authentication-related middleware
  app.use(express.cookieParser());

  // TODO: test using a spy to make we only interact with the database when we
  // intend to use the session information.
  var expressSession = express.session({
    secret: settings.secret,
    store: new MongoStore({
      mongooseConnection: db,
      maxAge: 300000
      // collection: 'sessions' [default]
    })
  });

  // Initialize Passport. Also use passport.session() middleware, to support
  // persistent login sessions (recommended).
  var passportMiddleware = passport.initialize();
  var passportSession = passport.session();
  var session = [expressSession, passportMiddleware, passportSession];

  // We don't want to apply the session middleware to every route, since that
  // can add unnecessary overhead. Instead, we save a reference to the
  // middlware for use in the routes module.
  app.set('session-middleware', session);
}

function setupRoutes() {
  routes.setup(app);

  // Serve the mobile collection app from /mobile
  app.use(s3({
    pathPrefix: '/mobile',
    remotePrefix: settings.mobilePrefix
  }));

  app.use(s3({
    pathPrefix: '/apps',
    remotePrefix: settings.appPrefix
  }));

  // Serve tile stuff
  app.use(s3({
    pathPrefix: '/tiles',
    remotePrefix: settings.tilePrefix
  }));

  // Redirect HTTP dashboard requests to HTTPS
  app.use(function (req, res, next) {
    if (req.path === '/' || req.path === '' || req.path === '/index.html') {
      if (!req.secure) {
        return res.redirect('https://' + req.get('host') + req.path);
      }
    }
    next();
  });

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
    console.log('info at=server event=listening port=' + port);
    cb(err);
  });
}

function mongoDisconnectLogger() {
  console.log('error at=server event=mongo_disconnect');
}

function run(cb) {
  // Set up the database object
  if (db === null || db.readyState === 0) {
    if (db !== null) {
      db.removeAllListeners();
    }

    console.log(_.template('info at=server event=starting port=${port}', {
      port: settings.port,
    }));

    if (!cb) {
      cb = function () {};
    }

    db = mongo.connect(function () {
      setupAuth(db);
      setupRoutes(); // Needs to happen AFTER setupAuth
      async.series([
        tasks.connect,
        startServer.bind(null, settings.port)
      ], cb);
    });

    db.on('disconnected', mongoDisconnectLogger);
  }
}

function stop(done) {
  db.removeListener('disconnected', mongoDisconnectLogger);
  server.close();
  postgres.close();
  async.series([
    tasks.close,
    db.close.bind(db)
  ], function () {
    console.log('info at=server event=stopped');
    if (done) { return done(); }
  });
}

module.exports = {
  run: run,
  stop: stop
};

// If this was run directly, run!
if (require.main === module) {
  run();
}
