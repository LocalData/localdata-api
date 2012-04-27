
// Main ViewModel for the page
var UploadVM = function(pageName) {
  var self = SurveyPageVM(pageName);

  self.createUploader = function() {
    var el = document.getElementById('file-uploader');
    var uploader = new qq.FileUploader({
      element: document.getElementById('file-uploader'),
      action: '/surveys/' + self.survey_id() + '/scans',
      debug: true,
      extraDropzones: [qq.getByClass(document, 'drop-area')[0]]
    });
  };

  // Initialization stuff
  self.onSetSurvey = self.createUploader;
  if (self.survey_id() != '') {
    self.createUploader();
  }

  return self;
};

$(document).ready(function() {
  $('body').css('visibility', 'visible');
  ko.applyBindings(new UploadVM('upload'));
});
