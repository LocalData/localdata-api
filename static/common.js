
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
    new LinkVM('progress', 'Progress', 'progress.html'),
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
