var request = require('request');

var BASEURL = 'http://localhost:3000';

var SURVEYID = 1;

function JSONpretty(data) {
  return JSON.stringify(data, null, '  ');
}

// Seed the database with forms
function seedforms() {
  var url = BASEURL + '/surveys/' + SURVEYID + '/forms';
  var data = {
    forms: [
      { parcels: [ {parcel_id: 10, bubblesets: []} ]
      , mapping: {}
      }
    , { parcels: [ {parcel_id: 11, bubblesets: []} ]
      , mapping: {}
      }
    ]
  };
  console.log('Posting to url: ' + url);
  request.post({url: url, json: data}, function(error, response, body) {
    if (error != null) {
      console.log('Received an error posting forms to the server: ' + error.message);
    } else {
      console.log('Posted forms to the server successfully.');
      console.log('Count: ' + body.forms.length);
      console.log('Data:');
      console.log(JSONpretty(body));
    }
  });
}

// Delete the forms for this survey
function clearforms() {
  var url = BASEURL + '/surveys/' + SURVEYID + '/forms';
  console.log('Deleting at url: ' + url);
  request.del({url: url}, function(error, response, body) {
    if (error != null) {
      console.log('Received an error forms : ' + error.message);
    } else {
      body = JSON.parse(body);
      console.log('Deleted ' + body.count + ' forms successfully.');
    }
  });
}

// Add a single form
function addform() {
  var url = BASEURL + '/surveys/' + SURVEYID + '/forms';
  var data = {
    forms: [
      { parcels: [ {parcel_id: 12, bubblesets: []} ]
      , mapping: {}
      }
    ]
  };
  console.log('Posting to url: ' + url);
  request.post({url: url, json: data}, function(error, response, body) {
    if (error != null) {
      console.log('Received an error posting forms to the server: ' + error.message);
    } else {
      console.log('Posted form to the server successfully.');
      console.log('ID: ' + body.form[0].id);
      console.log('Data:');
      console.log(JSONpretty(body));
    }
  });
}

// Get a single form
function getform(formid) {
  var url = BASEURL + '/surveys/' + SURVEYID + '/forms/' + formid;
  console.log('Getting url: ' + url);
  request.get({url: url}, function(error, response, body) {
    if (error != null) {
      console.log('Received an error getting form ' + formid + ': ' + error.message);
    } else {
      body = JSON.parse(body);
      console.log(JSONpretty(body.form));
    }
  });
}

// Get all the forms
function getallforms() {
  var url = BASEURL + '/surveys/' + SURVEYID + '/forms';
  console.log('Getting url: ' + url);
  request.get({url: url}, function(error, response, body) {
    if (error != null) {
      console.log('Received an error getting forms: ' + error.message);
    } else {
      body = JSON.parse(body);
      console.log('Received ' + body.forms.length + ' forms:');
      console.log(JSONpretty(body.forms));
    }
  });
}

// Get all the responses
function getallresponses() {
  var url = BASEURL + '/surveys/' + SURVEYID + '/responses';
  console.log('Getting url: ' + url);
  request.get({url: url}, function(error, response, body) {
    if (error != null) {
      console.log('Received an error getting responses : ' + error.message);
    } else {
      body = JSON.parse(body);
      console.log('Received ' + body.responses.length + ' responses:');
      console.log(JSONpretty(body.responses));
    }
  });
}

// Get a single response
function getresponse(responseid) {
  var url = BASEURL + '/surveys/' + SURVEYID + '/responses/' + responseid;
  console.log('Getting url: ' + url);
  request.get({url: url}, function(error, response, body) {
    if (error != null) {
      console.log('Received an error getting response ' + responseid + ': ' + error.message);
    } else {
      body = JSON.parse(body);
      console.log(JSONpretty(body.response));
    }
  });
}

// Seed the database with responses
function seedresponses() {
  var url = BASEURL + '/surveys/' + SURVEYID + '/responses';
  var data = {
    responses: [
      { parcels: [ {parcel_id: 10, responses: {'Q0': 0, 'Q1': 3}} ]
      }
    , { parcels: [ {parcel_id: 11, responses: {'Q0': 1, 'Q1': 4}} ]
      }
    ]
  };
  console.log('Posting to url: ' + url);
  request.post({url: url, json: data}, function(error, response, body) {
    if (error != null) {
      console.log('Received an error posting responses to the server: ' + error.message);
    } else if (response.statusCode != 200) {
      console.log('Received non-200 status code.');
      console.log(body);
    } else {
      console.log('Posted responses to the server successfully.');
      console.log('Count: ' + body.responses.length);
      console.log('Data:');
      console.log(JSONpretty(body));
    }
  });
}

// Add a single response to the database
function addresponse() {
  var url = BASEURL + '/surveys/' + SURVEYID + '/responses';
  var data = {
    responses: [
      { parcels: [ {parcel_id: 10, responses: {'Q0': 0, 'Q1': 3}} ]
      }
    ]
  };
  console.log('Posting to url: ' + url);
  request.post({url: url, json: data}, function(error, response, body) {
    if (error != null) {
      console.log('Received an error posting response to the server: ' + error.message);
    } else if (response.statusCode != 200) {
      console.log('Received non-200 status code.');
      console.log(body);
    } else {
      console.log('Posted response to the server successfully.');
      console.log('ID: ' + body.responses[0].id);
      console.log('Data:');
      console.log(JSONpretty(body));
    }
  });
}


var cmd = process.argv[2];
if (cmd === 'seedforms') {
  seedforms();
} else if (cmd === 'clearforms') {
  clearforms();
} else if (cmd === 'addform') {
  addform();
} else if (cmd === 'getform') {
  getform(process.argv[3]);
} else if (cmd === 'getallforms') {
  getallforms();
} else if (cmd === 'seedresponses') {
  seedresponses();
} else if (cmd === 'addresponse') {
  addresponse();
} else if (cmd === 'getallresponses') {
  getallresponses();
} else if (cmd == 'getresponse') {
  getresponse(process.argv[3]);
}

