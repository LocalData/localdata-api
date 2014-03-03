/*jslint node: true */
'use strict';

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
  // Surveys
  app.get('/api/surveys', users.ensureAuthenticated, surveys.list);
  app.get('/api/surveys/:surveyId', surveys.get);
  app.post('/api/surveys', users.ensureAuthenticated, surveys.post);
  app.put('/api/surveys/:surveyId', users.ensureAuthenticated, users.ensureSurveyAccess, surveys.put);
  app.get('/api/surveys/:surveyId/stats', surveys.stats);
  app.get('/api/slugs/:slug', surveys.getSlug);

  // Responses
  app.get('/api/surveys/:surveyId/responses', responses.list);
  app.get('/api/surveys/:surveyId/responses.geojson', formatHelper('geojson'), responses.list);
  app.get('/api/surveys/:surveyId/responses/:responseId', responses.get);
  app.del('/api/surveys/:surveyId/responses/:responseId', users.ensureAuthenticated, users.ensureSurveyAccess, responses.del);
  app.post('/api/surveys/:surveyId/responses', responses.post);
  app.get('/api/surveys/:surveyId/responses.csv', responses.sendCSV);
  app.get('/api/surveys/:surveyId/responses.kml', responses.sendKML);
  app.get('/api/surveys/:surveyId/responses.zip', responses.handleShapefile);

  // Forms
  app.get('/api/surveys/:surveyId/forms', forms.list);
  app.get('/api/surveys/:surveyId/forms/:formId', forms.get);
  app.post('/api/surveys/:surveyId/forms', users.ensureAuthenticated, users.ensureSurveyAccess,  forms.post);
  app.put('/api/surveys/:surveyId/forms/:formId', users.ensureAuthenticated, users.ensureSurveyAccess, forms.put);

  // Users
  app.get('/api/user', users.ensureAuthenticated, users.get);
  app.post('/api/user', enforceHTTPS, users.post);
  app.post('/api/login', enforceHTTPS, users.login);
  app.get('/logout', users.logout);
  app.get('/auth/return', users.auth_return);
  app.post('/api/user/forgot', users.forgotPassword);
  app.post('/api/user/reset', enforceHTTPS, users.resetPassword);

  // Orgs
  app.get('/api/orgs', orgs.list);
  app.get('/api/orgs/:orgId', users.ensureAuthenticated, orgs.get);
  app.post('/api/orgs', users.ensureAuthenticated, orgs.post);
  app.put('/api/orgs/:orgId', users.ensureAuthenticated, orgs.put);
  app.get('/api/users/:user/orgs', users.ensureAuthenticated, orgs.list);
  app.get('/api/user/orgs', users.ensureAuthenticated, orgs.listForCurrentUser);

  // Base geo features
  app.get('/api/features', features.useCache, features.get);
  app.get('/api/features.geojson', features.useCache, features.get);

  // Parcels
  app.get('/api/parcels', parcels.get);
  app.get('/api/parcels.geojson', parcels.useCache, parcels.getGeoJSON);

  // Dummy ping endpoint
  app.get('/ping', function (req, res) {
    req.session = null;
    res.send();
  });
};
