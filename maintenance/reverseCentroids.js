/*
 * Reverse centroid coordinates in the database 
 * 
 * Usage:
 * $ mongo server:port/database_name -u username -p password reverseCentroids.js
 *
 */

db.responseCollection.find({'geo_info.centroid':{$exists:true}}).forEach(function(elt){
  // type:2 is String: http://www.mongodb.org/display/DOCS/Advanced+Queries#AdvancedQueries-%24type
  elt.geo_info.centroid.reverse();
  db.responseCollection.save(elt);
});

db.responseCollection.ensureIndex({"geo_info.centroid": "2d"});
