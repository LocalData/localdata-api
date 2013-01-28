/*jslint node: true */
'use strict';

var bcrypt = require('bcrypt');
var express = require('express');
var http = require('http');
var mongo = require('mongodb');

var settings = require('./settings.js');

var passport = require('passport');
var LocalStrategy = require('passport-local').Strategy;

module.exports = {};

function setup(app, db, idgen, collectionName) {

  // Database ..................................................................
  function getCollection(cb) {
    return db.collection(collectionName, cb);
  }

  var User = {};

  // Sanitize user input to save to the database
  //  Keeps only the fields we wants
  //  Hashes the password
  //
  // @param {Object} user
  User.sanitizeToSave = function(user) {
    var safeUser = {};
    safeUser.email = user.email;
    safeUser.name = user.name;

    if(user._id) {
      safeUser._id = user._id;
    }

    if(user.hash) {
      safeUser.hash = user.hash;
    }

    if(user.password) {
      safeUser.hash = bcrypt.hashSync(user.password, 10);
    }
    
    return safeUser;
  };

  // Find a given user
  // @param {Object} query An object with a 'username' parameter.
  //  username should be an email
  // @param {Function} done
  User.findOne = function(query, done) {
    getCollection(function(error, collection) {
      collection.findOne({email: query.email}, function(error, user){
        if(error) {
          done(error);
        }

        if(user) {
          user.validPassword = function(password) {
            return bcrypt.compareSync(password, user.hash);
          };
        }

        // TODO: Better error handling (are we exposing internal errors?)
        // TODO: security
        done(error, user);
      });

    });
  };

  // Create a given user
  //
  // @param {Object} query An object with a 'username', 'name', and 'password'
  //  parameters. Username must be an email.
  // @param {Function} done
  User.create = function(query, done) {
    if(!query.email || query.email === '') {
      done({
        code: 400,
        name: 'UserCreationError',
        message: 'Email required'
      }, null);
      return;
    }

    if(!query.password || query.password === '') {
      done({
        code: 400,
        name:'UserCreationError',
        message: 'Password required'
      }, null);
      return;
    }

    // We only want to save the parameters we decide on.
    var safeQuery = User.sanitizeToSave(query);

    // Blank out the query so we can't use it anymore
    query = {};

    // Get ready to save the user
    getCollection(function(error, collection) {
      collection.insert(safeQuery, {safe: true}, function(error, documents) {
        if(error) {
          if(error.code === 11000) {
            // Mongo duplicate key error
            done({code: 400, err: 'An account with this email aready exists'});
            return;
          }
          // Some other error
          done({code: 500, err: 'Sorry, an error occurred. Please try again.'});
          return;
        }else {
          done(null, documents[0]);
        }
      });
    });

  };


  // Update a given user
  // WARNING: The caller must verify the user's identity.
  // This just does what it's told 
  //
  // @param {Object} query A user object, with ._id property
  // @param {Function} done
  User.update = function(query, done) {
    if(!query.email || query.email === '') {
      done({code: 400, err: 'Email required'}, null);
      return;
    }

    // We only want to save the parameters we decide on.
    var safeQuery = User.sanitizeToSave(query);
    
    // Blank out the query so we can't use it anymore
    query = {};

    getCollection(function(error, collection) {

      collection.save(safeQuery, {w: 1}, function(error, wc, something) {
        if(error) {
          // TODO: Log
          console.log('error updating: ', error.err, error.code);
          done(error);
          return;
        }

        console.log(error);
        done(null);
      });
    });
  };

  // Export the user functions for easy testing
  module.exports.User = User;

  // Some helpers we need to use
  app.use(express.cookieParser());
  app.use(express.session({ secret: settings.secret }));

  // Initialize Passport. Also use passport.session() middleware, to support
  // persistent login sessions (recommended).
  app.use(passport.initialize());
  app.use(passport.session());

  // Passport session setup.
  //   To support persistent login sessions, Passport needs to be able to
  //   serialize users into and deserialize users out of the session.  Typically,
  //   this will be as simple as storing the user ID when serializing, and finding
  //   the user by ID when deserializing.
  passport.serializeUser(function(user, done) {
    console.log('Serializing');

    // We don't want to be passing around sensitive stuff
    // Like password hashes
    var safeUser = {};
    safeUser.name = user.name;
    safeUser.email = user.email;
    safeUser._id = user._id;

    return done(null, safeUser);
  });

  passport.deserializeUser(function(user, done) {
    console.log('Deserializing');

    // We don't want to be passing around sensitive stuff
    // Like password hashes
    var safeUser = {};
    safeUser.name = user.name;
    safeUser.email = user.email;
    safeUser._id = user._id;

    return done(null, safeUser);
  });

  // Use the local authentication strategy in Passport.
  passport.use(new LocalStrategy({
      usernameField: 'email',
      passwordField: 'password'
    },
    function(username, password, done) {
      User.findOne({ email: username }, function(error, user) {
        if (error) { return done(error); }
        if(!user) {
          console.log('Login: user not found');
          return done(null, false, {
            'name': 'BadRequestError',
            'message': 'Account not found'
          });
        }
        if(!user.validPassword(password)) {
          console.log('Login: password incorrect');
          return done(null, false, {
            'name': 'BadRequestError',
            'message': 'Password incorrect'
          });
        }

        return done(null, user);
      });
    }
  ));

  // Login routes ..............................................................

  // Cheap way to save the URL parameter
  app.get('/auth/return', function(req, res){
    req.session.redirectTo = req.query.redirectTo;
    res.redirect('/login');
  });

  // GET /logout
  //  Does what you think it does.
  app.get('/logout', function(req, res){
    req.logout();
    res.redirect('/');
  });

  // POST  /api/login
  // Log the user in
  app.post('/api/login', function(req, response, next) {
    passport.authenticate(
      'local',
      function(error, user, info) {

        // If there's an error, send back a generic error.
        // Note that errors are not things like 'incorrect password'
        if(error) {
          return next(error);
        }

        // If we've got a user, create a session
        if(user) {
          req.logIn(user, function(error) {
            if (error) { return next(error); }
            response.redirect('/api/user');
          });
          return;
        }

        // If there was a problem logging the user in, it'll appear here.
        if(info) {
          console.log('Info ', info);
          response.send(400, info.message);
        }
      })(req, response, next);

  });

  // POST /api/user
  // Create a user
  app.post('/api/user', function(req, response){
    User.create(req.body, function(error, results) {
      if(error) {
        // TODO
        // Log better
        response.send(error.code, "We're sorry, an error has occurred");
      }else {
        req.logIn(results, function(error) {
          if (error) {
            // TODO
            // Log beter
            console.log('Unexpected error', error);
            response.send(401);
          }

          var safeUser = {};
          safeUser.name = req.user.name;
          safeUser.email = req.user.email;
          safeUser._id = req.user._id;

          // If successful, give the data of the newly logged in user
          response.json(safeUser);
        });
      }
    });

  });

  // GET /api/user
  //  Return details about the current user
  //  Return a 401 if there isn't a current user
  app.get('/api/user', function(req, response){
    if(req.isAuthenticated()) {
      response.send(req.user);
    }else {
      response.send(401);
    }
  });

}


// Utility / middleware ........................................................

// Simple route middleware to ensure user is authenticated.
//   Use this route middleware on any resource that needs to be protected.  If
//   the request is authenticated (typically via a persistent login session),
//   the request will proceed.  
//   Otherwise, the user will be sent a 401.
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }

  res.send(401);
}

module.exports = {
  setup: setup,
  ensureAuthenticated: ensureAuthenticated
};
