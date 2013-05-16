/*jslint node: true, indent: 2, white: true, vars: true */
/*globals suite, test, setup, suiteSetup, suiteTeardown, done, teardown */
'use strict';

var request = require('request');
var settings = require('../../settings-test.js');
var User = require('../../lib/models/User');

var fixtures = {};
module.exports = fixtures;

var BASEURL = 'http://localhost:' + settings.port + '/api';
var BASE_LOGOUT_URL = 'http://localhost:' + settings.port + '/logout';
var USER_URL = BASEURL + '/user';

fixtures.surveys = {
  "surveys" : [ {
    "name": "Just a survey",
    "location": "Detroit",
    "users": ["A", "B"],
    "paperinfo": {
      "dpi": 150,
      "regmarks": [
        {"type": 0, "bbox": [20, 20, 70, 70]},
        {"type": 0, "bbox": [20, 1580, 70, 1630]},
        {"type": 0, "bbox": [1205, 1580, 1255, 1630]}
      ],
      "barcode": {"bbox": [1055, 20, 1255, 220]}
    }
  } ]
};

fixtures.users = [{
    'name': 'User A',
    'email': 'a@localdata.com',
    'password': 'password'
  }, {
    'name': 'User B',
    'email': 'b@localdata.com',
    'password': 'drowssap'
  }
];

fixtures.clearUsers = function(callback) {
  User.collection.remove(function(error, result){
    if(error) {
      console.log(error);
    }
    callback();
  });
};

/**
 * Clear all users and create a new user.
 * Callback is given a request.jar cookie jar.
 * @param  {Function} callback Params (error, jar, userId)
 */
fixtures.setupUser = function(callback) {

  var jar = request.jar();

  fixtures.clearUsers(function(){
    request.post({
        url: USER_URL,
        json: fixtures.users[0],
        jar: jar
      },
      function (error, response, body) {
        if(error) {
          // console.log(error);
          callback(error, null);
        }
        // console.log("RETURNED USER", body, jar);
        callback(null, jar, body._id);
      }
    );
  });
};
