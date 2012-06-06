var assert = require('assert'), 
  listToCSVString = require('./../responses.js').listToCSVString;
  limitToMostRecent = require('./../responses.js').limitToMostRecent;
  limitAllResults = require('./../responses.js').limitAllResults;
  
  
suite('csvExport', function(){
  var row = ['a', 2, '3'];
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
    // These two have the same parcel ID, but the first was created before the second
    {
      "geo_info": {"parcel_id": "1234"},
      "created":"2011-05-24T23:16:57.266Z",
      "responses": {
        "use-count":"1",
        "use":"restaurant-or-bar",
        "restaurant-use":"restaurant"
      }
    },
    {
      "geo_info": {"parcel_id": "1234"},
      "created":"2012-05-24T23:16:57.266Z",
      "responses": {
        "use-count":"1",
        "use":"service",
        "service-use":"bank+drivethrough"
      }
    },
    
    // In some cases, this one should be split into two rows because there are multiple uses.
    {
      "geo_info": {"parcel_id": "1235"},
      "created":"2012-06-24T23:16:57.266Z",
      "responses": {
        "use-count":"2", // There are 2 uses!
        "use":"service",
        "service-use":"bank+drivethrough",
        "use-2":"restaurant-or-bar",
        "service-use-2":"restaurant"
      }
    }
  ];
  
  test('commasep should turn a simple list into a csv string', function(){
    var csv = listToCSVString(row, headers, headerCount);
    var expected = 'a,2,3';
    assert.equal(csv,expected);
  });
  
  test('arrays in fields should be serialized with semicolons', function() {
    var csv = listToCSVString(complexRow, headers, complexHeaderCount);
    var expected = 'a,1;2;3,4';
    assert.equal(csv,expected);
  });
  
  test('the limitToMostRecent function should only return the most recent of two parcel results', function() {
        
  });
  
  
});