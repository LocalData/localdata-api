//
var BASE_URL = 'http://localhost:3000';


var ProgressVM = function() {
  // Track if the user has entered a survey ID or not.
  this.pickedSurvey = ko.observable(false);
  // The name of the survey. TODO: get the actual name from the API
  this.surveyName = ko.observable('Survey');
  // The list of scanned forms
  this.scans = ko.observableArray([]);
  // ID of the survey
  this.survey_id = ko.observable('');

  this.scans_url = '';

  this.refreshData = function() {
    var self = this;
    console.log('Getting data');
    $.getJSON(this.scans_url, function(data) {
      self.processScanData(data);
    });
  };

  // Process the incoming data
  this.processScanData = function(data) {
      //this.scans(data.scans.map(function(x) { return new ScanVM(x); }));
      this.scans(data.scans);
  };

  this.refreshClick = function() {
    this.refreshData();
  };

  this.setSurvey = function() {
    this.pickedSurvey(true);
    var id = this.survey_id();
    this.scans_url = [BASE_URL, 'surveys', id, 'scans'].join('/');

    this.surveyName('Survey ' + id);

    // Get the data
    this.refreshData();

    // Save the state, so that a page refresh doesn't obliterate the survey ID.
    this.saveState();
  }
  
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
}

$(document).ready(function() {
  $('body').css('visibility', 'visible');
  ko.applyBindings(new ProgressVM());
});

