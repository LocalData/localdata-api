/*jslint node: true */
'use strict';

var bcrypt = require('bcrypt');
var express = require('express');
var http = require('http');
var mongo = require('mongodb');

var settings = require('./settings.js');

var passport = require('passport');
var FacebookStrategy = require('passport-facebook').Strategy;
var LocalStrategy = require('passport-local').Strategy;

module.exports = {};

function setup(app, db, idgen, collectionName) {

  // Database ..................................................................
  function getCollection(cb) {
    return db.collection(collectionName, cb);
  }

  var User = {};

  // Dangerous! 
  User.wipe = function(done) {
    getCollection(function(error, collection) {
      collection.remove({}, function(error, response){
        //done();
      });
    });
  };

  User.sanitizeToSave = function(user) {
    // TODO

    return user;
  };

  // Find a given user
  // @param {Object} query An object with a "username" parameter.
  //  username should be an email
  // @param {Function} done 
  User.findOne = function(query, done) {
    console.log("Finding a user like ", query);
    getCollection(function(error, collection) {
      collection.findOne({email: query.username}, function(error, user){ 
        console.log(error, user);

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
  // @param {Object} query An object with a "username", "name", and "password" 
  //  parameters. Username must be an email. 
  // @param {Function} done 
  User.create = function(query, done) {
    console.log("Creating user ", query);

    if(!query.email) {
      console.log("No email");
      done({code: 400, err: "Email required"}, null);
      return;
    }

    if(!query.password) {
      console.log("No password");
      done({code: 400, err: "Password required"}, null);
      return;
    }

    // We only want to save the parameters we decide on.
    var safeQuery = {};
    safeQuery.email = query.email;
    safeQuery.name = query.name;
    safeQuery.hash = bcrypt.hashSync(query.password, 10);

    // So we can't use query anymore
    query = {};

    // Get ready to save the user
    getCollection(function(error, collection) {
      collection.insert(safeQuery, {safe: true}, function(error, documents) {
        if(error) {
          console.log(error.err, error.code);
          if(error.code === 11000) {
            done({code: 400, err: "An account with this email aready exists"});
            return;
          }
          done({code: 400, err: "Sorry, an error occurred. Please try again."});
          return;
        }else {
          // console.log("Response from database: ", documents);
          // console.log("First record: ", documents[0]);
          done(error, documents[0]);
        }
      });
    });

  };


  // Update a given user
  // WARNING: The caller must verify the user's identity.
  // This just does what it's told 
  //
  // @param {Object} query A user object, with id
  // @param {Function} done
  User.update = function(query, done) {
    console.log("Updating user ", query);

    if(query.password === undefined) {
      done({code: 400, err: "Password required"}, null);
      return;
    }

    var safeQuery = {};
    safeQuery.email = query.email;
    safeQuery.name = query.name;
    safeQuery.hash = bcrypt.hashSync(query.password, 10);

    if(safeQuery.email === undefined) {
      done({code: 400, err: "Email required"}, null);
      return;
    }

    if(query.password && safeQuery.email) {
      getCollection(function(error, collection) {

        collection.save(safeQuery, {safe: true}, function(error, user) {
          if(error) {
            console.log(error.err, error.code);
          }

          console.log("Response from database: ", user);
          done(error, user);
        });
      });
    }
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
    console.log("Serializing");
    done(null, user);
  });

  passport.deserializeUser(function(user, done) {
    console.log("Deserializing");

    // We don't want to be passing around sensitive stuff
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
      console.log("Checking user");
      
      User.findOne({ username: username }, function(error, user) {
        if (error) { return done(error); }
        if(!user) {
          console.log("Login: user not found");
          return done(null, false, { 
            "name": "BadRequestError",
            "message": "Account not found" 
          });
        }
        if(!user.validPassword(password)) {
          console.log("Login: password incorrect");
          return done(null, false, { 
            "name": "BadRequestError",
            "message": "Password incorrect" 
          });
        }

        // console.log("Good user: ", user);
        return done(null, user);
      });
    }
  ));

  // Login routes ..............................................................

  // Cheap way to save the URL parameter
  app.get('/auth/return', function(req, res){
    // console.log("Redirect to ..............................");
    // console.log(req.query.redirectTo);
    req.session.redirectTo = req.query.redirectTo;
    res.redirect("/login");
  });

  // GET /logout
  //  Does what you think it does. 
  app.get('/logout', function(req, res){
    console.log("Logging the user out");
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
        // Note that errors are not things like "incorrect password"
        console.log(error);
        if(error) {
          return next(error);
        }

        // If we've got a user, create a session
        if(user) {
          req.logIn(user, function(error) {
            if (error) { return next(error); }
            response.redirect("/api/user");
          });
          return;
        }

        // If there was a problem logging the user in, it'll appear here.
        if(info) {
          console.log("Info ", info);
          response.send(200, info);
        }
      })(req, response, next);

  });

  // POST /api/user
  // Create a user
  app.post('/api/user', function(req, response){
    console.log("API: Create a user");

    var user = {};
    user.name = req.body.name;
    user.email = req.body.email;
    user.password = req.body.password;

    User.create(user, function(error, results) {
      // console.log("User creation run", error, results);

      if(error) {
        // console.log("Error saving user", error);
        response.send(error.code, error.err);
      }else {
        // console.log("Confirming save of user ", results);

        req.logIn(results, function(error) {
          if (error) {
            //TODO
            console.log("Unexpected error", error);
          }

          // If successful, give the data of the newly logged in user
          response.redirect("/api/user");
        });
      }
    });

  });

  // GET /api/user
  //  Return details about the current user
  //  Return a 401 if there isn't a current user
  app.get('/api/user', function(req, response){
    console.log("Is the request authenticated? ", req.isAuthenticated());
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
  console.log("Checking if authenticated");
  if (req.isAuthenticated()) {
    console.log("User is authenticated");
    return next();
  }

  res.send(401);
}

module.exports = {
  setup: setup,
  ensureAuthenticated: ensureAuthenticated
};
