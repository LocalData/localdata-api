/*jslint node: true */
'use strict';

var http = require('http');
var express = require('express');
var mongo = require('mongodb');
var uuid = require('node-uuid');
var fs = require('fs');
var s3 = require('connect-s3');
var settings = require('./settings.js');

// Login requirements
var passport = require('passport');
var util = require('util');
var FacebookStrategy = require('passport-facebook').Strategy;

// Routes are split into separate modules.
var users = require('./users');
var forms = require('./forms');
var responses = require('./responses');
var collectors = require('./collectors');
var surveys = require('./surveys');
var scans = require('./scans');
var parcels = require('./parcels');

// Names of the MongoDB collections we use
var RESPONSES = 'responseCollection';
var FORMS = 'formCollection';
var COLLECTORS = 'collectorCollection';
var SURVEYS = 'surveyCollection';
var SCANIMAGES = 'scanCollection';

// Basic app variables
var server;
var app = express(express.logger());
var db;

// ID generator
var idgen = uuid.v1;


console.log(settings.debug);

// Use the FacebookStrategy within Passport.
//   Strategies in Passport require a `verify` function, which accept
//   credentials (in this case, an accessToken, refreshToken, and Facebook
//   profile), and invoke a callback with a user object.
// passport.use(new FacebookStrategy({
//     clientID: settings.FACEBOOK_APP_ID,
//     clientSecret: settings.FACEBOOK_APP_SECRET,
//     callbackURL: "http://localhost:3000/auth/facebook/callback"
//   },
//   function(accessToken, refreshToken, profile, done) {
//     // asynchronous verification, for effect...
//     process.nextTick(function () {
//       
//       // To keep the example simple, the user's Facebook profile is returned to
//       // represent the logged-in user.  In a typical application, you would want
//       // to associate the Facebook account with a user record in your database,
//       // and return that user instead.
//       return done(null, profile);
//     });
//   }
// ));


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

// Login stuff .................................................................

// Passport session setup.
//   To support persistent login sessions, Passport needs to be able to
//   serialize users into and deserialize users out of the session.  Typically,
//   this will be as simple as storing the user ID when serializing, and finding
//   the user by ID when deserializing.  However, since this example does not
//   have a database of user records, the complete Facebook profile is serialized
//   and deserialized.

// TODO:
// UNCOMMENT??
// passport.serializeUser(function(user, done) {
//   console.log("Serializing:", user);
//   done(null, user);
// });
// 
// passport.deserializeUser(function(obj, done) {
//   console.log("Deserializing:", obj);
//   done(null, obj);
// });
// 
// app.use(express.cookieParser());
// 
// app.use(express.session({ secret: 'keyboard cat' }));
// // Initialize Passport. Also use passport.session() middleware, to support
// // persistent login sessions (recommended).
// app.use(passport.initialize());
// app.use(passport.session());

// ^^^ End login stuff .........................................................


// Add common headers
app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Mime-Type, X-Requested-With, X-File-Name, Content-Type");
  next();
});


// For sending local static files
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

  // TODO
  // User setup 
  users.setup(app, db, idgen, '');

  forms.setup(app, db, idgen, FORMS);
  responses.setup(app, db, idgen, RESPONSES);
  collectors.setup(app, db, idgen, COLLECTORS);
  surveys.setup(app, db, idgen, SURVEYS);
  scans.setup(app, db, idgen, SCANIMAGES, settings);
  parcels.setup(app, settings);


  // Login Routes
  // ...........................................................................
  // app.get('/login', function(req, res){
  //   res.render('login', { user: req.user });
  // });
// 
// 
  // // GET /auth/facebook
  // //   Use passport.authenticate() as route middleware to authenticate the
  // //   request.  The first step in Facebook authentication will involve
  // //   redirecting the user to facebook.com.  After authorization, Facebook will
  // //   redirect the user back to this application at /auth/facebook/callback
  // app.get('/auth/facebook',
  //   passport.authenticate('facebook'),
  //   function(req, res) {
  //     // The request will be redirected to Facebook for authentication, so this
  //     // function will not be called.
  //   });
// 
  // // GET /auth/facebook/callback
  // //   Use passport.authenticate() as route middleware to authenticate the
  // //   request.  If authentication fails, the user will be redirected back to the
  // //   login page.  Otherwise, the primary route function function will be called,
  // //   which, in this example, will redirect the user to the home page.
  // app.get('/auth/facebook/callback', 
  //   passport.authenticate('facebook', { failureRedirect: '/login' }),
  //   function(req, res) {
  //     res.redirect('/');
  //   });
// 
  // app.get('/logout', function(req, res){
  //   req.logout();
  //   res.redirect('/');
  // });


  // ^^^^ End login routes .....................................................


  // Serve our internal operational management app
  // TODO: move this to S3
  var opsPrefix = '/ops';
  app.use(function (req, res, next) {
    var path;
    var url = req.url;

    // If we aren't in /ops, don't do anything. 
    if (url.length < opsPrefix.length ||
       url.substr(0, opsPrefix.length) !== opsPrefix) {
      return next();
    }

    // Get the path following /ops and serve the correct files
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

  // Serve the dashboard and mobile app from S3 when we're in production.
  if (settings.debug === false) {
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
  }else {
    console.log("Using local static files");
    app.use('/', express.static(__dirname + '/static/client'));
    app.use('/mobile', express.static(__dirname + '/static/mobile'));
  };

}

// Ensure certain database structure
function ensureStructure(db, callback) {
  // Map f(callback) to f(error, callback)
  // If we encounter an error, bail early with the callback.
  function upgrade(g) {
    return function (err, done) {
      if (err) { done(err); }
      g(done);
    };
  }

  // Chain async function calls
  function chain(arr, done) {
    return arr.reduceRight(function (memo, f, index) {
      return function (err) {
        upgrade(f)(err, memo);
      };
    }, function (e) { done(e); });
  }

  // Make sure our collections are in good working order.
  // This primarily means making sure indexes are set up.

  function ensureResponses(done) {
    db.collection(RESPONSES, function (error, collection) {
      if (error) { return done(error); }
      chain([function indexCentroid(done) {
        // Ensure we have a geo index on the centroid field.
        collection.ensureIndex({'geo_info.centroid': '2d'}, done);
      },
      function indexCreated(done) {
        // Index the creation date, which we use to sort
        collection.ensureIndex('created', done);
      },
      function indexParcelId(done) {
        // Index the parcel ID
        collection.ensureIndex('parcel_id', done);
      }], done)();
    });
  }

  function ensureForms(done) {
    db.collection(FORMS, function (error, collection) {
      if (error) { return done(error); }
      chain([function indexCreated(done) {
        // Index the creation date, which we use to sort
        collection.ensureIndex('created', done);
      },
      function indexParcelId(done) {
        // Index the parcel IDs, used by paper forms
        collection.ensureIndex('parcels.parcel_id', done);
      }], done)();
    });
  }

  function ensureSurveys(done) {
    db.collection(SURVEYS, function (error, collection) {
      if (error) { done(error); }
      chain([function indexSlug(done) {
        // Index the slug field.
        collection.ensureIndex('slug', done);
      },
      function indexId(done) {
        // Index the survey ID.
        collection.ensureIndex('id', done);
      }], done)();
    });
  }

  function ensureSlugs(done) {
    db.collection(SURVEYS, function (error, collection) {

      // First, find all surveys.
      collection.find({}, function(err, cursor) {
        cursor.toArray(function (err, arr) {

          // Reject if there's an error
          if (err) { return done(err); }
          var count = 0;

          // Look for surveys with no slug
          arr.forEach(function (item) {

            // Add a slug if there isn't one
            if (item.slug === undefined) {
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
  
  // Chain everything together
  chain([ensureResponses, ensureForms, ensureSurveys, ensureSlugs], callback)();
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

  // If we need to create a database:
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

  // Open the database connection
  db.open(function() {
    if (settings.mongo_user !== undefined) {
      db.authenticate(settings.mongo_user, settings.mongo_password, function(err, result) {
        if (err) {
          console.log(err.message);
          return cb(err);
        }

        // Ensure good database structure when the app first loads.
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
