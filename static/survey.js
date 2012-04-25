
//
var BASE_URL = 'http://' + window.location.host;

var PageVM = function() {
  var self = this;

  // Navigation links VM
  self.links = new LinksVM('survey');

  self.pickedSurvey = ko.observable(false);
  // The name of the survey. TODO: get the actual name from the API
  self.surveyName = ko.observable('Survey');
  // ID of the survey
  self.survey_id = ko.observable('');
  // Survey JSON data, stringified
  self.surveyJSON = ko.observable();

  self.setSurvey = function() {
    self.pickedSurvey(true);
    var id = this.survey_id();

    self.surveyName('Survey ' + id);

    // Update the navigation links
    self.links.setSurvey(id);

    // Get the data
    self.refreshData();

    // Save the state, so that a page refresh doesn't obliterate the survey ID.
    self.saveState();
  }

  self.refreshData = function() {
    console.log('Getting data');
    var url = BASE_URL + '/surveys/' + self.survey_id();
    $.getJSON(url, function(data) {
      var survey_data = data.survey;
      self.surveyJSON(JSON.stringify(survey_data, null, '  '));
    });
  };


  // Restore the survey ID
  this.restoreState = function() {
    var hash = window.location.hash;
    if (hash.length > 1) {
      var id = hash.substring(1);
      console.log('Restoring survey ID to ' + id);
      this.survey_id(id);
      return true;
    }
    return false;
  };

  // Save the survey ID so the user doesn't have to enter it every time.
  this.saveState = function() {
    window.location.hash = this.survey_id();
  };

  // Initialization stuff
  this.init = function() {
    if (this.restoreState()) {
      this.setSurvey();
    }
  };
  this.init();
};

$(document).ready(function() {
  $('body').css('visibility', 'visible');
  ko.applyBindings(new PageVM());
});
