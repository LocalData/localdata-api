/*jslint node: true */
'use strict';

var nodemailer = require("nodemailer");
var settings = require("./settings.js");

var mailer = module.exports;

var transport = nodemailer.createTransport("SES", {
  AWSAccessKeyID: settings.aws_key,
  AWSSecretKey: settings.aws_secret
});

/**
 * Send an email
 * @param  {Object}   options Options: to, subject, text; all strings
 * @param  {Function} done    Optional error parameter
 */
mailer.send = function(options, done) {
  var message = {
    from: settings.email.from,
    
    // Comma separated list of recipients
    to: options.to,
    
    // Subject of the message
    subject: options.subject,

    // plaintext body
    text: options.text
  };

  transport.sendMail(message, function(error){
    done(error);
  });
};

