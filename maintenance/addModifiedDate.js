/*
 * Maintenance script to add a modified date to every entry.
 *
 * Usage:
 * $ mongo server:port/database_name -u username -p password addModifiedDate.js
 *
 */

db.responses.find({}).forEach(function(elt) {
  var i, modified;

  for (i = 0; i < elt.entries.length; i++) {
    //print(elt.entries[i].created);
    if (elt.entries[i].modified === undefined) {
      elt.entries[i].modified = new Date(elt.entries[i].created);
    }
  }

  db.responses.save(elt);
});

