
//
var BASE_URL = 'http://' + window.location.host;

var PageVM = function(pageName) {
  var self = SurveyPageVM(pageName);

  // Survey JSON data, stringified
  self.surveyJSON = ko.observable();

  self.refreshData = function() {
    console.log('Getting data');
    var url = BASE_URL + '/surveys/' + self.survey_id();
    $.getJSON(url, function(data) {
      var survey_data = data.survey;
      self.surveyJSON(JSON.stringify(survey_data, null, '  '));
    });
  };


  // Initialization stuff
  self.onSetSurvey = refreshData;
  if (self.survey_id() != '') {
    refreshData();
  }

  return self;
};

$(document).ready(function() {
  $('body').css('visibility', 'visible');
  ko.applyBindings(PageVM('survey'));
});
