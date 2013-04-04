//
var BASE_URL = 'http://' + window.location.host;

var ScanInfoModalVM = function() {
  var self = this;

  self.scanJSON = ko.observable();
  self.imageUrl = ko.observable();

  // TODO: separate this explicit markup interaction. This ViewModel is already
  // bound to the View, so we should be able to control the View without
  // manipulating the markup.
  self.view = $('#scanInfoModal');

  // Activate the modal.
  self.activate = function(item) {
    self.scanJSON(JSON.stringify(item, null, '  '));
    self.imageUrl(item.url);
    self.view.modal('show');
  };
}

// Main ViewModel for the page
var PageVM = function(pageName) {
  var self = SurveyPageVM(pageName);

  // Scan information VM
  self.scanInfoModal = new ScanInfoModalVM();
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

