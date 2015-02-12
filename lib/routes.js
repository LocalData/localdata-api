/*jslint node: true */
'use strict';

var stats = require('./controllers/stats');
var surveys = require('./controllers/surveys');
var responses = require('./controllers/responses');
var forms = require('./controllers/forms');
var users = require('./controllers/users');
var features = require('./controllers/features');
var parcels = require('./controllers/parcels');
var orgs = require('./controllers/orgs');

function formatHelper(format) {
  return function setFormat(req, res, next) {
    res.locals.format = format;
    next();
  };
}

function enforceHTTPS(req, res, next) {
  if (!req.secure) {
    res.send(400);
    return;
  }
  next();
}

exports.setup = function setup(app) {
  var session = app.get('session-middleware');

  // Surveys
  app.get('/api/surveys', session, users.ensureAuthenticated, surveys.list);
  app.get('/api/surveys/:surveyId', surveys.get);
  app.post('/api/surveys', session, users.ensureAuthenticated, surveys.post);
  app.put('/api/surveys/:surveyId', session, users.ensureAuthenticated, users.ensureSurveyAccess, surveys.put);
  app.del('/api/surveys/:surveyId', session, users.ensureAuthenticated, users.ensureSurveyAccess, surveys.del);
  app.get('/api/slugs/:slug', surveys.getSlug);

  // Survey users
  app.get('/api/surveys/:surveyId/users', session, users.ensureAuthenticated, users.ensureSurveyAccess, surveys.users);
  app.put('/api/surveys/:surveyId/users/:email', session, users.ensureAuthenticated, users.ensureSurveyAccess, surveys.addUser);
  app.del('/api/surveys/:surveyId/users/:email', session, users.ensureAuthenticated, users.ensureSurveyAccess, surveys.removeUser);

  // Stats
  app.get('/api/surveys/:surveyId/stats', stats.stats);
  app.get('/api/surveys/:surveyId/stats/activity', stats.activity);
  app.get('/api/surveys/:surveyId/stats/activity/:range', stats.byRange);

  // Responses
  app.get('/api/surveys/:surveyId/responses', responses.list);
  app.get('/api/surveys/:surveyId/responses.geojson', formatHelper('geojson'), responses.list);
  app.get('/api/surveys/:surveyId/responses/:responseId', responses.get);
  app.patch('/api/surveys/:surveyId/responses/:responseId', session, users.ensureAuthenticated, users.ensureSurveyAccess, responses.patch);
  app.post('/api/surveys/:surveyId/responses', responses.post);
  app.del('/api/surveys/:surveyId/responses/:responseId', session, users.ensureAuthenticated, users.ensureSurveyAccess, responses.del);
  app.post('/api/surveys/:surveyId/responses', responses.post);
  app.get('/api/surveys/:surveyId/responses.csv', session, responses.handleCSV);
  app.get('/api/surveys/:surveyId/responses.kml', session, responses.handleKML);
  app.get('/api/surveys/:surveyId/responses.zip', session, responses.handleShapefile);

  // Forms
  app.get('/api/surveys/:surveyId/forms', forms.list);
  app.get('/api/surveys/:surveyId/forms/:formId', forms.get);
  app.post('/api/surveys/:surveyId/forms', session, users.ensureAuthenticated, users.ensureSurveyAccess,  forms.post);
  app.put('/api/surveys/:surveyId/forms/:formId', session, users.ensureAuthenticated, users.ensureSurveyAccess, forms.put);

  // Users
  app.get('/api/user', session, users.ensureAuthenticated, users.get);
  app.post('/api/user', session, enforceHTTPS, users.post);
  app.post('/api/login', session, enforceHTTPS, users.login);
  app.get('/logout', session, users.logout);
  app.get('/auth/return', session, users.auth_return);
  app.post('/api/user/forgot', session, users.forgotPassword);
  app.post('/api/user/reset', session, enforceHTTPS, users.resetPassword);

  // Orgs
  app.get('/api/orgs', orgs.list);
  app.get('/api/orgs/:orgId', session, users.ensureAuthenticated, orgs.get);
  app.post('/api/orgs', session, users.ensureAuthenticated, orgs.post);
  app.put('/api/orgs/:orgId', session, users.ensureAuthenticated, orgs.put);
  app.get('/api/users/:user/orgs', session, users.ensureAuthenticated, orgs.list);
  app.get('/api/user/orgs', session, users.ensureAuthenticated, orgs.listForCurrentUser);

  // Base geo features
  app.get('/api/features', features.useCache, features.get);
  app.get('/api/features/:source/:id', features.useCache, features.getById);
  app.get('/api/features.geojson', features.useCache, features.get);
  app.get('/api/sources', features.listSources);

  // Parcels
  app.get('/api/parcels', parcels.get);
  app.get('/api/parcels.geojson', parcels.useCache, parcels.getGeoJSON);

  // Dummy ping endpoint
  app.get('/ping', function (req, res) {
    req.session = null;
    res.send();
  });
};
