/*
 * Maintenance script to create geospatial index on the geo_info.centroid property
 * geo_info.centroid should be in the format [float lat, float lng]
 * This script also does some minor updates to make sure existing objects fit
 *  that format.
 * 
 * Usage:
 * $ mongo server:port/database_name -u username -p password indexCentroids.js 
 *
 */

db.responseCollection.find({'geo_info.centroid':{$type:2}}).forEach(function(elt){
  var centroid = elt.geo_info.centroid;
  centroid[0] = parseFloat(centroid[0]);
  centroid[1] = parseFloat(centroid[1]);
  print(tojson(elt.geo_info.centroid));  
  db.responseCollection.save(elt);
});

db.responseCollection.ensureIndex({"geo_info.centroid": "2d"});
