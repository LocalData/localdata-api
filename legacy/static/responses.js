//
var BASE_URL = 'http://' + window.location.host;

var ResponseInfoModalVM = function(pageVM) {
  var self = this;

  self.responseJSON = ko.observable();
  self.imageUrl = ko.observable();

  // TODO: separate this explicit markup interaction. This ViewModel is already
  // bound to the View, so we should be able to control the View without
  // manipulating the markup.
  self.view = $('#responseInfoModal');

  // Activate the modal.
  self.activate = function(item) {
    console.log('activating response info modal.');
    self.responseJSON(JSON.stringify(item, null, '  '));

    // If this is a paper-based response, get the scanned image.
    if (item.source && item.source.type == 'paper') {
      var scan_url = BASE_URL
                     + '/surveys/'
                     + pageVM.survey_id()
                     + '/scans/'
                     + item.source.scan;
      $.ajax(scan_url, { dataType: 'json' })
      .done(function(data) {
        if (data.scan) {
          self.imageUrl(data.scan.url);
        }
      });
    }

    self.view.modal('show');
  };
}

// Main ViewModel for the page
var PageVM = function(pageName) {
  var self = SurveyPageVM(pageName);

  // Response information VM
  self.responseInfoModal = new ResponseInfoModalVM(self);
  // Delete confirmation VM
  self.deleteModal = new DeleteModalVM();

  // The list of responses
  self.responses = ko.observableArray([]);

  self.responses_url = ko.computed(function() {
    return BASE_URL + '/surveys/' + self.survey_id() + '/responses'
  });

  self.refreshData = function() {
    console.log('Getting data');
    $.ajax(self.responses_url(), { dataType: 'json' })
    .done(function(data) {
      if (data.responses) {
        self.responses(data.responses);
      }
    });
  };

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

  self.onSetSurvey = refreshData;
  if (self.survey_id() != '') {
    refreshData();
  }

  return self;
}

$(document).ready(function() {
  $('body').css('visibility', 'visible');
  ko.applyBindings(PageVM('responses'));
});

