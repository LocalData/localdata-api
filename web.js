// XXX var http = require('http');
var express = require('express');
var mongo = require('mongodb')
var db = new mongo.Db('scratchdb', new mongo.Server('localhost', 27017, {}), {});
var uuid = require('node-uuid');

/*
 * Routes are split into separate modules.
 */
var forms = require('./forms');
var responses = require('./responses');
var collectors = require('./collectors');

RESPONSES = 'responseCollection';
FORMS = 'formCollection';
COLLECTORS = 'collectorCollection';

var app = express.createServer(express.logger());

app.configure(function() {
  app.use(express.bodyParser());
});

// ID generator
var idgen = uuid.v1;

// Set up routes for forms
forms.setup(app, db, idgen, FORMS);
responses.setup(app, db, idgen, RESPONSES);
collectors.setup(app, db, idgen, COLLECTORS);


// Kick things off
db.open(function() {
  var port = process.env.PORT || 3000;
  app.listen(port, function() {
    console.log('Listening on ' + port);
  });
});

