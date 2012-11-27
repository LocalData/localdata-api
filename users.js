/*jslint node: true */
'use strict';

var http = require('http');
var express = require('express');
var settings = require('./settings.js');

var passport = require('passport');
var FacebookStrategy = require('passport-facebook').Strategy;


// User accounts ...............................................................

function setup(app, db, idgen, collectionName) {

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
	    // asynchronous verification, for effect...
	    process.nextTick(function () {
	      
	      // To keep the example simple, the user's Facebook profile is returned to
	      // represent the logged-in user.  In a typical application, you would want
	      // to associate the Facebook account with a user record in your database,
	      // and return that user instead.
	      return done(null, profile);
	    });
	  }
	));


  // Login stuff .................................................................

  // Passport session setup.
  //   To support persistent login sessions, Passport needs to be able to
  //   serialize users into and deserialize users out of the session.  Typically,
  //   this will be as simple as storing the user ID when serializing, and finding
  //   the user by ID when deserializing.  However, since this example does not
  //   have a database of user records, the complete Facebook profile is serialized
  //   and deserialized.
  passport.serializeUser(function(user, done) {
    console.log("Serializing:", user);
    done(null, user);
  });

  passport.deserializeUser(function(obj, done) {
    console.log("Deserializing:", obj);
    done(null, obj);
  });

  app.use(express.cookieParser());

  app.use(express.session({ secret: settings.secret }));
  // Initialize Passport. Also use passport.session() middleware, to support
  // persistent login sessions (recommended).
  app.use(passport.initialize());
  app.use(passport.session());

  // ^^^ End login stuff .........................................................


  // LOGIN ROUTES --------------------------------------------------------------

  app.get('/login', function(req, res){
    res.render('login', { user: req.user });
  });

  // GET /auth/facebook
  //   Use passport.authenticate() as route middleware to authenticate the
  //   request.  The first step in Facebook authentication will involve
  //   redirecting the user to facebook.com.  After authorization, Facebook will
  //   redirect the user back to this application at /auth/facebook/callback
  app.get('/auth/facebook',
    passport.authenticate('facebook'),
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
      res.redirect('/');
    }
  );

  app.get('/logout', function(req, res){
    req.logout();
    res.redirect('/');
  });

  // GET /user
  //  Return details about the current user, if any.
  app.get('/api/user', function(req, response){
    console.log(req.isAuthenticated());
    if(req.isAuthenticated()) {
      response.send(req.user);
    }else {
      response.send({});
    }
  });




};

module.exports = {
  setup: setup
};
