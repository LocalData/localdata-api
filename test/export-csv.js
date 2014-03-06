/*jslint node: true, indent: 2, white: true, vars: true */
/*globals suite, test, setup, suiteSetup, suiteTeardown, done, teardown */
'use strict';

var assert = require('assert');
var responses = require('../lib/controllers/responses.js');
var listToCSVString = responses.listToCSVString;
var getLatestEntries = responses.getLatestEntries;
var getAllEntries = responses.AllEntriesies;

  
suite('In csvExport,', function(){
  var row = ['a', 2, '3', undefined, ""];
  var headers = ['first', 'second', 'third'];
  var headerCount = {
    'first': 1,
    'second': 1,
    'third': 1
  };
  var complexRow = ['a', [1,2,3], 4];
  var complexHeaderCount = {
    'first': 1,
    'second': 3,
    'third': 1
  };
  
  var fakeResults = [
    // These two have the same parcel ID, but the first is more recent
    {
      "geo_info": {
        "centroid": [1,2]
      },
      "parcel_id": "1234",
      "created":"2011-05-24T23:16:57.266Z",
      "responses": {
        "use-count":"1",
        "use":"restaurant-or-bar",
        "restaurant-use":"restaurant"
      },
      'older': true
    },
    {
      "geo_info": {
        "centroid": [1,2]
      },
      "parcel_id": "1234",
      "created":"2012-05-24T23:16:57.266Z",
      "responses": {
        "use-count":"1",
        "use":"service",
        "service-use":"bank+drivethrough"
      },
      'older': false
    },
    
    // In some cases, this one should be split into two rows because there are multiple uses.
    {
      "geo_info": {},
      "parcel_id": "1235",
      "created":"2012-06-24T23:16:57.266Z",
      "responses": {
        "use-count":"2", // There are 2 uses!
        "use":"service",
        "service-use":"nail salon",
        "use-2":"service",
        "service-use-2":"server farm",
        "is it vacant?": "yes!"
      }
    }
  ];
  
  test('commasep should turn a simple list into a csv string', function(){
    var csv = listToCSVString(row, headers, headerCount);
    var expected = 'a,2,3,,';
    assert.equal(csv,expected);
  });
  
  test('arrays in fields should be serialized with semicolons', function() {
    var csv = listToCSVString(complexRow, headers, complexHeaderCount);
    var expected = 'a,1;2;3,4';
    assert.equal(csv,expected);
  });
  
  // TODO: test responses.getLatestEntries and responses.getAllEntries separately from API.
  // The data format they ingest has changed significantly from the old
  // filterToLatest. But both functions are tested via the API tests, which for
  // now is sufficient.
});

