//
var BASE_URL = 'http://' + window.location.host;

// Main ViewModel for the page
var PageVM = function() {
  var self = this;

  // Delete confirmation VM
  self.deleteModal = new DeleteModalVM();

  // Navigation links VM
  self.links = new LinksVM('responses');

  // Track if the user has entered a survey ID or not.
  self.pickedSurvey = ko.observable(false);
  // The name of the survey. TODO: get the actual name from the API
  self.surveyName = ko.observable('Survey');

  // ID of the survey
  self.survey_id = ko.observable('');

  // The list of responses
  self.responses = ko.observableArray([]);

  self.responses_url = '';

  self.refreshData = function() {
    console.log('Getting data');
    $.ajax(self.responses_url, { dataType: 'json' })
    .done(function(data) {
      self.responses(data.responses);
    });
  };

  self.refreshClick = function() {
    self.refreshData();
  };

  self.setSurvey = function() {
    self.pickedSurvey(true);
    var id = self.survey_id();

    // Set API endpoint URLs
    self.responses_url = [BASE_URL, 'surveys', id, 'responses'].join('/');

    self.surveyName('Survey ' + id);

    // Update the navigation links
    self.links.setSurvey(id);

    // Get the data
    self.refreshData();

    // Save the state, so that a page refresh doesn't obliterate the survey ID.
    self.saveState();
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
  
  // Restore the survey ID
  self.restoreState = function() {
    var hash = window.location.hash;
    if (hash.length > 1) {
      var id = hash.substring(1);
      console.log('Restoring survey ID to ' + id);
      self.survey_id(id);
      return true;
    }
    return false;
  };

  // Save the survey ID so the user doesn't have to enter it every time.
  self.saveState = function() {
    window.location.hash = self.survey_id();
  };

  // Initialization stuff
  self.init = function() {
    if (self.restoreState()) {
      self.setSurvey();
    }
  };
  self.init();
}

$(document).ready(function() {
  $('body').css('visibility', 'visible');
  ko.applyBindings(new PageVM());
});

