var assert = require('assert');
var KMLWriter = require('./../responses.js').KMLWriter;
var listToKMLString = require('./../responses.js').listToKMLString;
  
  
suite('In kmlExport,', function(){
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
      "geo_info": {
        "centroid": [1,2],
        "geometry": {
          "coordinates": [
            [1,2],
            [2,2],
            [3,2],
            [1,2]
          ]
        }
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
        "centroid": [1,2],
        "geometry": {
          "coordinates": [
            [1,2],
            [2,2],
            [3,2],
            [1,2]
          ]
        }
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
      "geo_info": {
        "centroid": [1,2],
        "geometry": {
          "coordinates": [
            [1,2],
            [2,2],
            [3,2],
            [1,2]
          ]
        }
      },
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
  
});