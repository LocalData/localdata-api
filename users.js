/*jslint node: true */
'use strict';

var http = require('http');
var express = require('express');
var mongo = require('mongodb');
var settings = require('./settings.js');

var passport = require('passport');
var FacebookStrategy = require('passport-facebook').Strategy;

module.exports = {};

function setup(app, db, idgen, collectionName) {

  // Database ..................................................................

  function getCollection(cb) {
    return db.collection(collectionName, cb);
  }

  function getOrCreate(user, callback) {

    getCollection(function(err, collection) {

      // If we're dealing with an existing document, we want to make sure we 
      // find it. Necessary because we delete user._id later on.
      var query;
      if (user.hasOwnProperty("_id")) {
        // First, cast to a string to make sure we've got a consistent datatype
        id = String(user._id);
        // Then build an objectId from the string
        query = {_id: new mongo.BSONPure.ObjectID(id)};
      }else {
        if (user.hasOwnProperty("email")) {
          query = {email: user.email};
        }else {
          query = user;
        }
      }

      console.log("Query: ", query);

      // Remove the id; it breaks findAndModify with upsert 
      // ("Mod on _id not allowed")
      delete user._id;

      collection.findAndModify(
        query,                    // find
        [['_id','asc']],          // sort by
        {$set: user},             // update
        {upsert: true, new:true}, // create if new, return new obj
        function(err, object) {
          if (err) {
            console.warn(err.message);
          } else {
            console.log("Object found: ", object);  // undefined if no matching object exists.
          }  
          callback(object);
        }
      );

    });
  }

  module.exports.getOrCreate = getOrCreate;

	// Use the FacebookStrategy within Passport.
	//   Strategies in Passport require a `verify` function, which accept
	//   credentials (in this case, an accessToken, refreshToken, and Facebook
	//   profile), and invoke a callback with a user object.
	passport.use(new FacebookStrategy({
	    clientID: settings.FACEBOOK_APP_ID,
	    clientSecret: settings.FACEBOOK_APP_SECRET,
	    callbackURL: "http://localhost:3000/auth/facebook/callback"
	  },
	  function(accessToken, refreshToken, profile, done) {
	    process.nextTick(function () {

	      // To keep the example simple, the user's Facebook profile is returned to
	      // represent the logged-in user.  In a typical application, you would want
	      // to associate the Facebook account with a user record in your database,
	      // and return that user instead.
	      return done(null, profile);
	    });
	  }
	));


  // Passport session setup.
  //   To support persistent login sessions, Passport needs to be able to
  //   serialize users into and deserialize users out of the session.  Typically,
  //   this will be as simple as storing the user ID when serializing, and finding
  //   the user by ID when deserializing.  However, since this example does not
  //   have a database of user records, the complete Facebook profile is serialized
  //   and deserialized.
  passport.serializeUser(function(userFromFacebook, done) {
    // console.log("Serializing:", userFromFacebook._json);

    getOrCreate(userFromFacebook._json, function(userFromDatabase){
      console.log(userFromDatabase);
      done(null, userFromDatabase);
    });
  });

  passport.deserializeUser(function(obj, done) {
    console.log("Deserializing:", obj);

    getOrCreate(obj, function(user) {
      console.log(user);
      user._id = String(user._id);
      done(null, user);
    });
  });

  // Some helpers we need to use
  app.use(express.cookieParser());
  app.use(express.session({ secret: settings.secret }));

  // Initialize Passport. Also use passport.session() middleware, to support
  // persistent login sessions (recommended).
  app.use(passport.initialize());
  app.use(passport.session());



  // Login routes ..............................................................

  // GET /auth/facebook
  //   Use passport.authenticate() as route middleware to authenticate the
  //   request.  The first step in Facebook authentication will involve
  //   redirecting the user to facebook.com.  After authorization, Facebook will
  //   redirect the user back to this application at /auth/facebook/callback
  app.get('/auth/facebook',
    passport.authenticate('facebook', { scope: [ 'email' ] }),
    function(req, res) {
      // The request will be redirected to Facebook for authentication, so this
      // function will not be called.
    }
  );

  // GET /auth/facebook/callback
  //   Use passport.authenticate() as route middleware to authenticate the
  //   request.  If authentication fails, the user will be redirected back to the
  //   login page.  Otherwise, the primary route function function will be called,
  //   which, in this example, will redirect the user to the home page.
  app.get('/auth/facebook/callback', 
    passport.authenticate('facebook', { failureRedirect: '/login' }),
    function(req, res) {
      res.redirect('/index.html');
    }
  );

  // GET /logout
  //  Does what you think it does. 
  app.get('/logout', function(req, res){
    req.logout();
    res.redirect('/');
  });

  // GET /user
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
  if (req.isAuthenticated()) { return next(); }
  res.send(401);
}

module.exports = {
  setup: setup,
  ensureAuthenticated: ensureAuthenticated,
};
