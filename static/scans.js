//
var BASE_URL = 'http://' + window.location.host;

// Main ViewModel for the page
var PageVM = function(pageName) {
  var self = SurveyPageVM(pageName);

  // Delete confirmation VM
  self.deleteModal = new DeleteModalVM();

  // The list of scanned forms
  this.scans = ko.observableArray([]);

  self.scans_url = ko.computed(function() {
    return BASE_URL + '/surveys/' + self.survey_id() + '/scans'
  });

  self.refreshData = function() {
    console.log('Getting data');
    $.ajax(self.scans_url(), { dataType: 'json' })
    .done(function(data) {
      self.scans(data.scans);
    });
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

  self.onSetSurvey = refreshData;
  if (self.survey_id() != '') {
    refreshData();
  }

  return self;
}

$(document).ready(function() {
  $('body').css('visibility', 'visible');
  ko.applyBindings(PageVM('scans'));
});

