/*
 * Maintenance script to add polygons to all parcels
 * 
 * Usage:
 * $ mongo server:port/database_name -u username -p password addPolygons.js 
 *
 */

db.responseCollection.find({'geo_info.poylgon':{$type:10}}).forEach(function(elt){
  // type:10 is Null: http://www.mongodb.org/display/DOCS/Advanced+Queries#AdvancedQueries-%24type
  
  // Get centroid
  var centroid = elt.geo_info.centroid;
  
  // Get geodata from server
  var lat = parseFloat(centroid[0]);
  var lng = parseFloat(centroid[1]);
  var url = 'http://stormy-mountain-3909.herokuapp.com/detroit/parcel?lat=' + lat + '&lng=' + lng;
  console.log(url);
  apiGet(url).done(function (data) {
    console.log(data);
    // Process the results. Strip whitespace. Convert the polygon to geoJSON
    //var result = {
    //  parcel_id: data[0].trim(), 
    //  address: data[3].trim(),
    //  polygon: jQuery.parseJSON(data[4]),
    //  centroid: jQuery.parseJSON(data[5])
    //};
  });

  
  

});

