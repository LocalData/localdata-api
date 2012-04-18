
var UploadVM = function() {
  var self = this;

  self.pickedSurvey = ko.observable(false);
  self.surveyName = ko.observable('Survey');
  self.survey_id = ko.observable();

  self.setSurvey = function() {
    self.pickedSurvey(true);
    self.surveyName('Survey ' + self.survey_id());

    // Save the state, so that a page refresh doesn't obliterate the survey ID.
    this.saveState();

    self.createUploader(self.survey_id());

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

  self.createUploader = function(id) {
    var el = document.getElementById('file-uploader');
    var uploader = new qq.FileUploader({
      element: document.getElementById('file-uploader'),
      action: '/surveys/' + id + '/scans',
      debug: true,
      extraDropzones: [qq.getByClass(document, 'drop-area')[0]]
    });
  };

  // Initialization stuff
  self.init = function() {
    if (self.restoreState()) {
      self.setSurvey();
    }
  };
  self.init();
};

$(document).ready(function() {
  $('body').css('visibility', 'visible');
  ko.applyBindings(new UploadVM());
});
