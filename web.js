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

/*
 * ==================================================
 * Collector
 * ==================================================
 */

// XXX Right now this just sends fake data.
// curl http://localhost:3000/survey/1/collector/3
app.get('/survey/:surveyid/collector/:cid', function(req, response) {
  console.log('Getting data for collector ' + req.params.cid + ' of survey ' + req.params.surveyid);
  var data = {id: req.params.cid, survey: req.params.surveyid, forms: [0, 1, 2, 3], remaining: [1, 2, 3]};
  response.send(data);
});







// ==================================================

/*
 * MONGO TEST STUFF.
 */

// curl http://localhost:3000/test
app.get('/test', function(req, response) {
  console.log('hit /test');
  db.collection('testCollection', function(err, collection) {
    var arr = [];
    collection.find().each(function(err, doc) {
    });
    collection.find().toArray(function(err, results) {
      response.send(results);
    });
  });
});

// curl http://localhost:3000/test/20
app.get('/test/:id', function(req, response) {
  db.collection('testCollection', function(err, collection) {
    collection.find({"id": req.params.id}, function(err, cursor) {
      console.log(err);
      var arr = [];
      cursor.each(function(err, doc) {
        if (doc == null) {
          response.send(arr.join('    '));
        } else {
          arr.push(JSON.stringify(doc));
        }
      });
    });
  });
});

//curl -H "Content-Type: application/json" -X POST -d '{"name":"Matt","title":"Fellow"}' http://localhost:3000/test/20
app.post('/test/:id', function(req, response) {
  console.log('\tposting to /test:id');
  console.log('\tbody.name ' + req.body.name);
  console.log('\tbody.title ' + req.body.title);
  db.collection('testCollection', function(err, collection) {
    var id = req.params.id;
    entry = { "id" : id,
              "name" : req.body.name,
              "title" : req.body.title};
    collection.insert(entry, function() {
      response.send(entry);
    });
  });
});


app.delete('/test/:id', function(req, response) {
  console.log('Deleting entries with id: ' + req.params.id);
  db.collection('testCollection', function(err, collection) {
    collection.remove({"id": req.params.id}, {safe: true}, function(err, count) {
      response.send('Removed ' + count + ' items.');
    });
  });
});

db.open(function() {
  var port = process.env.PORT || 3000;
  app.listen(port, function() {
    console.log('Listening on ' + port);
  });
});

