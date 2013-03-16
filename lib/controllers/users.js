/*jslint node: true */
'use strict';

var bcrypt = require('bcrypt');
var passport = require('passport');
var LocalStrategy = require('passport-local').Strategy;

var util = require('../util');
var User = require('../models/User');

// Passport session setup.
//   To support persistent login sessions, Passport needs to be able to
//   serialize users into and deserialize users out of the session.  Typically,
//   this will be as simple as storing the user ID when serializing, and finding
//   the user by ID when deserializing.
passport.serializeUser(function (user, done) {
  console.log('Serializing a user');

  // We serialize the name and email address along with the ID, so we don't
  // need to hit the database when we deserialize.

  // We don't want to pass around sensitive stuff like password hashes
  var safeUser = {};
  safeUser.name = user.name;
  safeUser.email = user.email;
  safeUser._id = user._id;

  return done(null, safeUser);
});

passport.deserializeUser(function (user, done) {
  console.log('Deserializing a user');

  // We don't want to pass around sensitive stuff like password hashes
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
    User.findOne({ email: username }, function (error, user) {
      if (error) { return done(error); }

      if (!user) {
        console.log('Login: user not found');
        return done(null, false, {
          name: 'BadRequestError',
          message: 'Account not found'
        });
      }

      if (!user.validPassword(password)) {
        console.log('Login: password incorrect');
        return done(null, false, {
          name: 'BadRequestError',
          message: 'Password incorrect'
        });
      }

      return done(null, user);
    });
  }
));

// Cheap way to save the URL parameter
exports.auth_return = function auth_return(req, res) {
  req.session.redirectTo = req.query.redirectTo;
  res.redirect('/login');
};

// Does what you think it does.
exports.logout = function logout(req, res) {
  req.logout();
  res.redirect('/');
};

// POST /api/login
// Log the user in
exports.login = function login(req, res, next) {
  passport.authenticate('local', function(error, user, info) {
    // If there's an error, send back a generic error.
    // Note that errors are not things like 'incorrect password'
    if (error) {
      return next(error);
    }

    // If we've got a user, create a session
    if (user) {
      req.logIn(user, function (error) {
        if (error) { return next(error); }
        res.redirect('/api/user');
      });
      return;
    }

    // If there was a problem logging the user in, it'll appear here.
    if (info) {
      console.log('Info ', info);
      res.send(400, info.message);
    }
  })(req, res, next);
};

// POST /api/user
// Create a user
exports.post = function post(req, res) {
  var data = req.body;

  var user = new User({
    email: data.email,
    name: data.name
  });

  user.save(function (error, doc) {
    if (error) {
      if (error.code === 11000) {
        // Mongo duplicate key error
        res.send(400, {
          type: 'AccountExistsError',
          message: 'An account with that email already exists'
        });
      } else {
        res.send(500);
      }
      return;
    }

    req.logIn(doc.toObject(), function (error) {
      if (error) {
        // TODO: If this is unexpected, we should probably return status code 500.
        console.log('Unexpected error: ' + error.type + ' ' + error.message);
        res.send(401);
        return;
      }
      res.send(doc.toObject());
    });
  });
};

// GET /api/user
// Get information about the current user
exports.get = function get(req, res) {
  res.send(req.user);
};

// Utility / middleware ........................................................

// Simple route middleware to ensure user is authenticated.
//   Use this route middleware on any resource that needs to be protected.  If
//   the request is authenticated (typically via a persistent login session),
//   the request will proceed.  
//   Otherwise, the user will be sent a 401.
// TODO: Should we return 403 Forbidden?
exports.ensureAuthenticated = function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }

  res.send(401, {
    type: 'AuthError',
    message: 'You must be logged in to access that resource'
  });
}
