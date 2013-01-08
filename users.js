/*jslint node: true */
'use strict';

var http = require('http');
var express = require('express');
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
          console.log("Checking password");
          user.validPassword = function(password) {
            return user.password === password;
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

    if(!query.password) {
      console.log("No password");
      done({code: 400, err: "Password required"}, null);
      return;
    }

    if(!query.email) {
      console.log("No email");
      done({code: 400, err: "Email required"}, null);
      return;
    }

    if(query.password && query.email) {
      getCollection(function(error, collection) {
        collection.insert(query, {safe: true}, function(error, documents) {
          if(error) {
            console.log(error.err, error.code);
            done(error, null);
          }else {
            console.log("Response from database: ", documents);
            console.log("First record: ", documents[0]);
            done(error, documents[0]);
          }
        });
      });
    }
  };

  // Update a given user
  // WARNING: provides no securiy checks
  // You must ensure that the caller has verified the user's identity. 
  //
  // @param {Object} query A user object, with id
  // @param {Function} done
  User.update = function(query, done) {
    console.log("Updating user ", query);

    if(query.password === undefined) {
      done({code: 500, err: "Password required"}, null);
      return;
    }

    if(query.email === undefined) {
      done({code: 500, err: "Email required"}, null);
      return;
    }

    if(query.password && query.email) {
      getCollection(function(error, collection) {

        collection.save(query, {safe: true}, function(error, user) {
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

  // Passport session setup.
  //   To support persistent login sessions, Passport needs to be able to
  //   serialize users into and deserialize users out of the session.  Typically,
  //   this will be as simple as storing the user ID when serializing, and finding
  //   the user by ID when deserializing.  However, since this example does not
  //   have a database of user records, the complete Facebook profile is serialized
  //   and deserialized.
  // passport.serializeUser(function(userFromFacebook, done) {
  //   // console.log(userFromFacebook);
  //   // console.log("Serializing:", userFromFacebook);
  //   console.log("Serializing");
// 
  //   getOrCreate(userFromFacebook, function(userFromDatabase){
  //     done(null, userFromDatabase);
  //   });
  // });
// 
  // passport.deserializeUser(function(obj, done) {
  //   return done(null, obj);
  // });

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
    console.log("Serializing", user);
    done(null, user);
  });

   passport.deserializeUser(function(user, done) {
    console.log("Deserializing", user);
    return done(null, user);
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
          return done(null, false, { message: "Sorry, we couldn't log you in with that name." });
        }
        if(!user.validPassword(password)) {
          console.log("Login: password incorrect");
          return done(null, false, { message: "Sorry, we couldn't log you in with that password." });
        }

        console.log("Good user: ", user);
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
    req.logout();
    res.redirect('/');
  });

  // POST /api/user
  //  Create a user
  app.post('/api/user', function(req, response){
    console.log("API: Create a user");

    var user = {};
    user.name = req.body.name;
    user.email = req.body.email;
    user.password = req.body.password;

    User.create(user, function(error, results) {
      console.log("User creation run", error, results);
      if(error) {
        console.log("Error saving user", error);
        response.send(error.code, error.err);
      }else {
        console.log("Confirming save of user ", results);

        req.logIn(results, function(err) {
          if (err) {
            console.log("Unexpected error");
            console.log(error);
            //TODO
          }
          response.send(results);
        });
      }
    });

  });

  // GET /api/user
  //  Return details about the current user
  //  Return a 401 if there isn't a current user
  app.get('/api/user', function(req, response){
    console.log(req.isAuthenticated());
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
