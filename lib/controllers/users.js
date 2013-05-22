/*jslint node: true */
'use strict';

var bcrypt = require('bcrypt');
var passport = require('passport');
var LocalStrategy = require('passport-local').Strategy;
var uuid = require('node-uuid');

var util = require('../util');
var User = require('../models/User');
var templates = require('../../templates/templates');
var mailer = require('../email');

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
  function (username, password, done) {
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

/**
 * Return the date when a token should expire
 * Right now, that's 24 hours
 * @return {Date}
 */
function createTokenExpiry() {
  return new Date(Date.now() + 24*60*60*1000); // 24 hours
}

exports.serializeResetInfo = function serializeResetInfo(email, token) {
  return (new Buffer(JSON.stringify([ email,  token ]))).toString('base64');
};

// We can implement this in the browser using
// JSON.parse(atob(string))
exports.deserializeResetInfo = function deserializeResetInfo(string) {
  var info = JSON.parse((new Buffer(string, 'base64')).toString('utf8'));
  return {
    email: info[0],
    token: info[1]
  };
};


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
    name: data.name,
    password: data.password
  });

  user.save(function (error, doc) {
    if (error) {
      if (error.code === 11000) {
        // Mongo duplicate key error
        res.send(400, {
          type: 'AccountExistsError',
          message: 'An account with that email already exists'
        });
      } else if (error.name === 'ValidationError') {
        var message;

        var path = null;
        if (error.errors !== undefined && error.errors.length > 0) {
          path = error.errors[0].path;
        }

        if (path !== null) {
          message = path + ' required';
        } else {
          message = 'Missing fields';
        }

        res.send(400, {
          name: 'UserCreationError',
          message: message
        });
      } else {
        console.log(error);
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

/*
 * Reset a user's password
 * Or, given a valid reset token, allow the user to reset their password.
 */
exports.forgotPassword = function forgotPassword(req, response, next) {
  var email = req.body.user.email;
  if (email === undefined) {
    response.send({ name: 'PasswordResetError', message: 'Email required' }, 400);
    return;
  }

  // Find the user
  User.findOne({ email: email }, function (error, user) {
    if (error) {
      // TODO: Log
      return next(error);
    }
    if(!user) {
      response.send({ name: 'PasswordResetError', message: 'Account not found' }, 400);
      return;
    }

    // Generate a new token
    // & set an expiration date
    var token = uuid.v4(); // random uuid (v1 is time-based)
    var expiry = createTokenExpiry();

    // We store the token hashed, since it's a password equivalent.
    var tokenHash = user.hashToken(token);

    // Save it to the user
    user.reset = {
      hashedToken: tokenHash,
      expiry: expiry
    };
    user.markModified('reset');

    user.save(function (error, doc) {
      if(error) {
        // TODO: Log
        console.log('Error setting password reset info', error);
        return next(error);
      }

      // Serialize the email + token
      var resetString = exports.serializeResetInfo(email, token);

      // Generate the email
      var host = req.headers.host;
      var resetText = templates.render('passwordReset', {
        'link': 'https://' + host + '/reset/' + resetString
      }, function(error, resetText) {
        var message = {
          to: email,
          subject: 'Your LocalData password',
          text: resetText
        };

        // Send the email!
        mailer.send(message, function(error) {
          if(error){
            return next(error);
          }
          response.send(200);
        });
      });
    });
  });
};

/**
 * POST /api/user/reset
 * Reset a user's password
 * Requires a valid email (tied to a user), password, and auth token
 */
exports.resetPassword = function resetPassword(req, response, next) {
  // Get the parameters
  var email = req.body.reset.email;
  var token = req.body.reset.token;
  var password = req.body.reset.password;

  if (!email) {
    response.send({ name: 'PasswordResetError', message: 'Email required' }, 400);
    return;
  }
  if (!token) {
    response.send({ name: 'PasswordResetError', message: 'Password reset code required' }, 400);
    return;
  }
  if (!password) {
    response.send({ name: 'PasswordResetError', message: 'Password required' }, 400);
    return;
  }

  // Find the user
  var user = User.findOne({email: email}, function(error, user) {
    if (error) {
      return next(error);
    }

    if (user === null) {
      response.send({
        name: 'BadRequestError',
        message: 'Account not found'
      }, 400);
      return;
    }

    // Check that the user has a reset object
    if (user.reset === undefined) {
      response.send({ name: 'PasswordResetError', message: 'Reset token required' }, 400);
      return;
    }

    // Make sure the token matches
    if (!bcrypt.compareSync(token, user.reset.hashedToken)) {
      // TODO: Should this be a 403 instead of 400?
      response.send({
        name: 'BadRequestError',
        message: 'Invalid reset token'
      }, 400);
      return;
    }

    // Check that the token hasn't expired.
    var now = new Date().getTime();
    var expiry = user.reset.expiry;
    if (expiry.getTime() < now) {
      response.send({
        name: 'BadRequestError',
        message: 'Token expired'
      }, 400);
      return;
    }

    // Change password and clear the reset token
    user.reset = undefined;
    user.password = password;
    user.save(function (error) {
      if (error) {
        return next(error);
      }

      // Log in the user
      req.logIn(user, function(error) {
        if (error) {
          // TODO:
          // Log
          console.log('Unexpected error', error);
          response.send(500);
        }
        response.redirect('/api/user');
        return;
      });
    });
  });
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
};
