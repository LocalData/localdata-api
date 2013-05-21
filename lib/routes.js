/*jslint node: true */
'use strict';

var surveys = require('./controllers/surveys');
var responses = require('./controllers/responses');
var forms = require('./controllers/forms');
var users = require('./controllers/users');
var parcels = require('./controllers/parcels');

function formatHelper(format) {
  return function setFormat(req, res, next) {
    res.locals.format = format;
    next();
  };
}

exports.setup = function setup(app, settings) {
  // Config
  responses.configureResponses(settings);

  // Surveys
  app.get('/api/surveys', users.ensureAuthenticated, surveys.list);
  app.get('/api/surveys/:surveyId', surveys.get);
  app.post('/api/surveys', users.ensureAuthenticated, surveys.post);
  app.put('/api/surveys/:surveyId', users.ensureAuthenticated, surveys.put);
  app.get('/api/slugs/:slug', surveys.getSlug);

  // Responses
  app.get('/api/surveys/:surveyId/responses', responses.list);
  app.get('/api/surveys/:surveyId/responses.geojson', formatHelper('geojson'), responses.list);
  app.get('/api/surveys/:surveyId/responses/:responseId', responses.get);
  app.del('/api/surveys/:surveyId/responses/:responseId', users.ensureAuthenticated, responses.del);
  app.post('/api/surveys/:surveyId/responses', responses.post);
  app.get('/api/surveys/:surveyId/responses.csv', responses.sendCSV);
  app.get('/api/surveys/:surveyId/responses.kml', responses.sendKML);
  app.get('/api/surveys/:surveyId/responses.zip', responses.handleShapefile);

  // Forms
  app.get('/api/surveys/:surveyId/forms', forms.list);
  app.get('/api/surveys/:surveyId/forms/:formId', forms.get);
  app.post('/api/surveys/:surveyId/forms', forms.post);
  app.put('/api/surveys/:surveyId/forms/:formId', users.ensureAuthenticated, forms.put);

  // Users
  app.get('/api/user', users.ensureAuthenticated, users.get);
  app.post('/api/user', users.post);
  app.post('/api/login', users.login);
  app.get('/logout', users.logout);
  app.get('/auth/return', users.auth_return);
  app.post('/api/user/forgot', users.forgotPassword);
  app.post('/api/user/reset', users.resetPassword);

  // Parcels
  app.get('/api/parcels', parcels.get);
  app.get('/api/parcels.geojson', parcels.useCache, parcels.getGeoJSON);
};
