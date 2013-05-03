
var BASE_URL = 'http://' + window.location.host;
var create_url = BASE_URL + '/surveys';

var makeBboxObservable = function(bbox, self) {
  //var bbox = ko.observableArray([null, null, null, null]);
  return ko.computed({
    read: function() {
      if (bbox().length == 0) return null;
      return '[' + bbox().join(', ') + ']';
    },
    write: function(value) {
      var jsonstring = '{"arr" : ' + value + '}';
      var data = JSON.parse(jsonstring);
      bbox(data.arr);
    },
    owner: self
  });
}
// Main ViewModel for the page.
var PageVM = function() {
  var self = this;

  // Navigation links VM
  self.links = new LinksVM('newsurvey');

  // Survey info data
  self.survey_name = ko.observable();
  self.regmark_bboxes = [
    ko.observableArray(),
    ko.observableArray(),
    ko.observableArray(),
    ko.observableArray()
  ];
  self.bc_bbox = ko.observableArray();

  // Survey info input/display
  self.bbox_0 = makeBboxObservable(self.regmark_bboxes[0], self);
  self.bbox_1 = makeBboxObservable(self.regmark_bboxes[1], self);
  self.bbox_2 = makeBboxObservable(self.regmark_bboxes[2], self);
  self.bbox_bc = makeBboxObservable(self.bc_bbox, self);

  self.submitSurvey = function() {
    var data = {surveys: [
      {
        name: self.survey_name(),
        paperinfo:
          {
            dpi: 150,
            regmarks: [
              {type: 0, bbox: self.regmark_bboxes[0]()},
              {type: 0, bbox: self.regmark_bboxes[1]()},
              {type: 0, bbox: self.regmark_bboxes[2]()}],
            barcode: {bbox: self.bc_bbox()}
          }
      }]};
    console.log(JSON.stringify(data));
    $.ajax(create_url, {
      contentType: 'application/json',
      dataType: 'json',
      type: 'POST',
      data: JSON.stringify(data)
    })
    .done(function(result) {
      var id = result.surveys[0].id;
      navigateToSurvey(id);
    });
  };
};

$(document).ready(function() {
  ko.applyBindings(new PageVM());
});
