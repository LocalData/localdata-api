/*
 * Make all usernames lowercase
 *
 * Usage:
 * $ mongo server:port/database_name -u username -p password lowercaseUsers.js
 *
 */

var i = 0;
db.usersCollection.find({}).forEach(function(user){
  i += 1;
  user.email = user.email.toLowerCase();
  db.usersCollection.save(user);
  print("Lowercased user " + i);
});
