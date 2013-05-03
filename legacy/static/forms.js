//
var BASE_URL = 'http://' + window.location.host;

var FormInfoModalVM = function() {
  var self = this;

  self.formJSON = ko.observable();

  // TODO: separate this explicit markup interaction. This ViewModel is already
  // bound to the View, so we should be able to control the View without
  // manipulating the markup.
  self.view = $('#formInfoModal');

  // Activate the Delete Confirmation Modal.
  self.activate = function(item) {
    self.formJSON(JSON.stringify(item, null, '  '));
    self.view.modal('show');
  };

  // XXX
  //self.dismiss = function() {
  //  self.view.modal('hide');
  //};
}

// Main ViewModel for the page
var PageVM = function(pageName) {
  var self = SurveyPageVM(pageName);

  // Form information VM
  self.formInfoModal = new FormInfoModalVM();

  // Delete confirmation VM
  self.deleteModal = new DeleteModalVM();

  // The list of forms
  this.forms = ko.observableArray([]);

  self.forms_url = ko.computed(function() {
    return BASE_URL + '/surveys/' + self.survey_id() + '/forms'
  });

  self.refreshData = function() {
    console.log('Getting data');
    $.ajax(self.forms_url(), { dataType: 'json' })
    .done(function(data) {
      self.forms(data.forms);
    });
  };

  // Confirm that we should remove a form
  self.confirmRemoveForm = function(item) {
    // Remove a form entry from the database
    function remover() {
      var url = BASE_URL + '/surveys/' + self.survey_id() + '/forms/' + item.id;
      deleteFromAPI(url, function() {
        // If successful, remove the deleted item from the observable list
        self.forms.remove(item);
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
  ko.applyBindings(PageVM('forms'));
});

