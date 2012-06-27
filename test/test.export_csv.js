var assert = require('assert');
var listToCSVString = require('./../responses.js').listToCSVString;
var filterToMostRecent = require('./../responses.js').filterToMostRecent;
var filterAllResults = require('./../responses.js').filterAllResults;
var filterToOneRowPerUse = require('./../responses.js').filterToOneRowPerUse;
  
  
suite('In csvExport,', function(){
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
    // These two have the same parcel ID, but the first is more recent
    {
      "geo_info": {},
      "parcel_id": "1234",
      "created":"2011-05-24T23:16:57.266Z",
      "responses": {
        "use-count":"1",
        "use":"restaurant-or-bar",
        "restaurant-use":"restaurant"
      },
      'older': true,
    },
    {
      "geo_info": {},
      "parcel_id": "1234",
      "created":"2012-05-24T23:16:57.266Z",
      "responses": {
        "use-count":"1",
        "use":"service",
        "service-use":"bank+drivethrough"
      },
      'older': false,
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
    var expected = 'a,2,3';
    assert.equal(csv,expected);
  });
  
  test('arrays in fields should be serialized with semicolons', function() {
    var csv = listToCSVString(complexRow, headers, complexHeaderCount);
    var expected = 'a,1;2;3,4';
    assert.equal(csv,expected);
  });
  
  test('the filterToMostRecent function should only return the most recent of two parcel results', function() {
    var filteredResults = filterToMostRecent(fakeResults);
    
    // Check if a parcel ID appears more than once
    var parcelIDs = {};
    for (var i=0; i < filteredResults.length; i++){
      var result = filteredResults[i];
      if (parcelIDs.hasOwnProperty(result['parcel_id'])) {
        assert(false);
      };
      parcelIDs[result['parcel_id']] = true;
    }
    
    // Make sure it's the newer of the two
    if (filteredResults[0]['older']) {
      assert(false);
    };
  });
  
  test('the filterToOneRowPerUse should split results with use_counts > 1 into n rows', function() {
    var filteredResults = filterToOneRowPerUse(fakeResults);
    console.log(filteredResults);
    if(filteredResults[3] == undefined){
      assert(false);
    };
  });
  
  
});