//
var BASE_URL = 'http://' + window.location.host;

function removeHash(str) {
  var index = str.indexOf('#');
  if (index === -1) {
    return str;
  }
  return str.slice(0, index);
}

function navigateToSurvey(id) {
  window.location = 'survey.html#' + id;
}

function deleteFromAPI(url, cb) {
  // Use header to indicate a DELETE request
  $.ajax({
    url: url,
    type: 'POST',
    headers: {'X-HTTP-Method-Override': 'DELETE'},
    success: cb
  });
}

var LinkVM = function(name, title, page) {
  var self = this;
  self.name = ko.observable(name);
  self.title = ko.observable(title);
  self.page = ko.observable(page);
}

var LinksVM = function(current) {
  var self = this;
  self.global_links = [
    new LinkVM('newsurvey', 'New Survey', 'newsurvey.html'),
    new LinkVM('allsurveys', 'All Surveys', 'surveys.html')
  ];
  self.survey_links = [
    new LinkVM('survey', 'Survey Info', 'survey.html'),
    new LinkVM('responses', 'Responses', 'responses.html'),
    new LinkVM('scans', 'Scanned Paper Forms', 'scans.html'),
    new LinkVM('forms', 'Generated Form Data', 'forms.html'),
    new LinkVM('upload', 'Upload Forms', 'upload.html')
  ];

  self.current = current;

  self.setSurvey = function(id) {
    for (var i = 0; i < self.survey_links.length; i++) {
      self.survey_links[i].page(self.survey_links[i].page() + '#' + id);
    }
  };

  self.navigate = function(link) {
    window.location = link.page;
  };
};

var DeleteModalVM = function(parent) {
  var self = this;

  self.parent = parent;
  // TODO: separate this explicit markup interaction. This ViewModel is already
  // bound to the View, so we should be able to control the View without
  // manipulating the markup.
  self.view = $('#deleteModal');

  self.deleter = undefined;
  self.confirm = function() {
    self.dismiss();
    if (self.deleter != undefined) {
      self.deleter();
    }
  };

  // Activate the Delete Confirmation Modal.
  // We specify the actual deletion function to call if the user confirms.
  self.activate = function(deleter) {
    if (deleter != undefined) {
      self.deleter = deleter;
      self.view.modal('show');
    }
  };

  self.dismiss = function() {
    self.view.modal('hide');
  };
}


// Base ViewModel for pages that pertain to a specific survey.
// Use parasitic inheritance to create a specific ViewModel for a page.
var SurveyPageVM = function(pageName) {
  var self = this;

  // Navigation links VM
  self.links = new LinksVM(pageName);

  // Track if the user has entered a survey ID or not.
  self.pickedSurvey = ko.observable(false);
  // The name of the survey. TODO: get the actual name from the API
  self.surveyName = ko.observable('Survey');
  // ID of the survey
  self.survey_id = ko.observable('');
  self.survey = undefined;

  self.onSetSurvey = undefined;
  self.setSurvey = function() {
    self.pickedSurvey(true);
    var id = self.survey_id();

    $.ajax(BASE_URL + '/surveys/' + id, { dataType: 'json' })
    .done(function(data) {
      self.survey = data.survey;
      self.surveyName('Survey: ' + self.survey.name);
    });

    // Update the navigation links
    self.links.setSurvey(id);

    // Save the state, so that a page refresh doesn't obliterate the survey ID.
    self.saveState();

    // Kick off the callback if there is one.
    if (self.onSetSurvey) {
      self.onSetSurvey();
    }
  }

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
  if (self.restoreState()) {
    self.setSurvey();
  }

  return self;
}
