/*jslint node: true, indent: 2, white: true, vars: true */
/*globals suite, test, setup, suiteSetup, suiteTeardown, done, teardown */
'use strict';

var should = require('should');

var mailer = require('../lib/email');
var settings = require('../settings-test.js');

suite('Email', function () {

  test('Send an email', function (done) {

    var options = {
      'to': settings.email.to || 'example@example.com',
      'subject': 'hello world',
      'text': 'email body here'
    };

    mailer.send(options, function(error){
      should.not.exist(error);

      done();
    });

  });

});

