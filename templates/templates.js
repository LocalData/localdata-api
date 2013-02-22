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
 * @return {String}            The rendered template
 */
templates.render = function(templateKey, options) {
  var path = './templates/' + templates[templateKey];
  console.log(path);
	var template = fs.readFileSync(path, 'utf8');
  return ejs.render(template, options);
};