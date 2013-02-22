/*jslint node: true, indent: 2, white: true, vars: true */
/*globals suite, test, setup, suiteSetup, suiteTeardown, done, teardown */
'use strict';

var server = require('../web.js');
var assert = require('assert');
var request = require('request');
var should = require('should');

var templates = require('../templates/templates.js');

suite('Surveys', function () {

  suite('templates', function() {
    test('Render a template', function (done) {
      var data = {
        data: 'hello world'
      };
      var rendered = templates.render('sample', data);

      assert(rendered === 'static hello world');

      done();
    });
  });

});

