var assert = require('assert'), 
  commasep = require('./../responses.js').commasep;
  
suite('csvExport', function(){
  test('commasep should turn a simple array into a csv string', function(){
    
    var row = ['a', 2, '3'];
    var headers = ['first', 'second', 'third'];
    var headerCount = {
      'first': 1,
      'second': 1,
      'third': 1
    };
    
    var csv = commasep(row, headers, headerCount);
    var expected = 'a,2,3';
    assert.equal(csv,expected);
  });
  
  
});