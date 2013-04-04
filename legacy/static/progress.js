//
var BASE_URL = 'http://' + window.location.host;

// Main ViewModel for the page
var ProgressVM = function() {
  var self = this;

  // Delete confirmation VM
  self.deleteModal = new DeleteModalVM();

  // Navigation links VM
  self.links = new LinksVM('progress');

  // Track if the user has entered a survey ID or not.
  this.pickedSurvey = ko.observable(false);
  // The name of the survey. TODO: get the actual name from the API
  this.surveyName = ko.observable('Survey');

  // ID of the survey
  this.survey_id = ko.observable('');

  // The list of responses
  this.responses = ko.observableArray([]);
  // The list of scanned forms
  this.scans = ko.observableArray([]);
  // The list of generated forms
  this.forms = ko.observableArray([]);

  this.responses_url = '';
  this.scans_url = '';
  this.forms_url = '';

  self.refreshData = function() {
    console.log('Getting data');
    $.getJSON(self.responses_url, self.processResponsesData);
    $.getJSON(self.scans_url, self.processScanData);
    $.getJSON(self.forms_url, self.processFormsData);
  };

  // Process the incoming data
  self.processResponsesData = function(data) {
    self.responses(data.responses);
  };
  // Process the incoming data
  self.processScanData = function(data) {
    self.scans(data.scans);
  };
  // Process the incoming data
  self.processFormsData = function(data) {
    data.forms.forEach(function(x) {if (x.type == undefined) x.type = '';})
    self.forms(data.forms);
  };

  self.refreshClick = function() {
    self.refreshData();
  };

  this.setSurvey = function() {
    this.pickedSurvey(true);
    var id = this.survey_id();

    // Set API endpoint URLs
    this.responses_url = [BASE_URL, 'surveys', id, 'responses'].join('/');
    this.scans_url = [BASE_URL, 'surveys', id, 'scans'].join('/');
    this.forms_url = [BASE_URL, 'surveys', id, 'forms'].join('/');

    this.surveyName('Survey ' + id);

    // Update the navigation links
    self.links.setSurvey(id);

    // Get the data
    this.refreshData();

    // Save the state, so that a page refresh doesn't obliterate the survey ID.
    this.saveState();
  }

  // Confirm that we should remove a response
  self.confirmRemoveResponse = function(item) {
    // Remove a response entry from the database
    function remover() {
      var url = BASE_URL + '/surveys/' + self.survey_id() + '/responses/' + item.id;
      deleteFromAPI(url, function() {
        // If successful, remove the deleted item from the observable list
        self.responses.remove(item);
      });
    }
    self.deleteModal.activate(remover);
  };
  
  // Confirm that we should remove a scan
  self.confirmRemoveScan = function(item) {
    // Remove a scan entry from the database
    function remover() {
      var url = BASE_URL + '/surveys/' + self.survey_id() + '/scans/' + item.id;
      deleteFromAPI(url, function() {
        // If successful, remove the deleted item from the observable list
        self.scans.remove(item);
      });
    }
    self.deleteModal.activate(remover);
  };
  
  // Confirm that we should remove a form
  self.confirmRemoveForm = function(item) {
    // Remove a response entry from the database
    function remover() {
      var url = BASE_URL + '/surveys/' + self.survey_id() + '/forms/' + item.id;
      deleteFromAPI(url, function() {
        // If successful, remove the deleted item from the observable list
        self.forms.remove(item);
      });
    }
    self.deleteModal.activate(remover);
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
}

$(document).ready(function() {
  $('body').css('visibility', 'visible');
  ko.applyBindings(new ProgressVM());
});

