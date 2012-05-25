var assert = require('assert'), 
  commasep = require('./../responses.js').commasep;
  
suite('csvExport', function(){
  var row = ['a', 2, '3'];
  var headers = ['first', 'second', 'third'];
  var headerCount = {
    'first': 1,
    'second': 1,
    'third': 1
  };
  var complexRow = ['a', [1,2,3], 4];
  
  test('commasep should turn a simple list into a csv string', function(){
    var csv = commasep(row, headers, headerCount);
    var expected = 'a,2,3';
    assert.equal(csv,expected);
  });
  
  
  test('arrays should be serialized with semicolons', function() {
    var csv = commasep(complexRow, headers, headerCount);
    var expected = 'a,1;2;3,4';
    assert.equal(csv,expected);
  });
  
  
});