/*jslint node: true */
'use strict';

var ejs = require('ejs');
var fs = require('fs');

var templates = module.exports;

templates.sample = 'email/sample.ejs';
templates.passwordReset = 'email/forgotPassword.ejs';

/**
 * Render a template
 * @param  {String}   template Key for template
 * @param  {Object}   options  Parameters to fill the template
 * @param  {Function} callback Takes the rendered string
 * @return {String}            The rendered template
 */
templates.render = function(templateKey, options, callback) {
  var path = './templates/' + templates[templateKey];
	fs.readFile(path, 'utf8', function(error, template){
    callback(ejs.render(template, options));
  });
  
};