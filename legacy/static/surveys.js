
var BASE_URL = 'http://' + window.location.host;
var surveys_url = BASE_URL + '/surveys';

function deleteFromAPI(url, cb) {
  // Use header to indicate a DELETE request
  $.ajax({
    url: url,
    type: 'POST',
    headers: {'X-HTTP-Method-Override': 'DELETE'},
    success: cb
  });
}


// Main ViewModel for the page.
var PageVM = function() {
  var self = this;

  // Navigation links VM
  self.links = new LinksVM('allsurveys');

  // Delete confirmation VM
  self.deleteModal = new DeleteModalVM();


  // List of surveys
  self.surveys = ko.observableArray();

  self.refresh = function() {
    $.getJSON(surveys_url, function(result) {
      console.log(result);
      self.surveys(result.surveys);
    });
  };

  self.goToSurvey = function(item) {
    navigateToSurvey(item.id);
  };

  // Confirm that we should delete a survey
  self.confirmDelete = function(item) {
    // Remove a response entry from the database
    function remover() {
      var url = BASE_URL + '/surveys/' + item.id;
      deleteFromAPI(url, function() {
        // If successful, refresh the list
        self.refresh();
      });
    }
    self.deleteModal.activate(remover);
  };

  // Init
  (function() {
    self.refresh();
  })();
};

$(document).ready(function() {
  ko.applyBindings(new PageVM());
});
