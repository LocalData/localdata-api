/*
 * Add a created date property to every survey
 *
 * Usage:
 * $ mongo server:port/database_name -u username -p password addSurveyDates.js
 *
 */

db.surveyCollection.find({}).forEach(function(survey){
  survey.created = survey._id.getTimestamp();
  db.surveyCollection.save(survey);
  print("Added date " + survey.created);
});
