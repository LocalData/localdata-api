
function removeHash(str) {
  var index = str.indexOf('#');
  if (index === -1) {
    return str;
  }
  return str.slice(0, index);
}

var LinksVM = function() {
  var self = this;
  self.progress = ko.observable('progress.html');
  self.upload = ko.observable('upload.html');

  self.setSurvey = function(id) {
    self.progress(removeHash(self.progress()) + '#' + id);
    self.upload(removeHash(self.upload()) + '#' + id);
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
