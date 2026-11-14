// Copy to src/private.local.js (git-ignored) and fill in. Read by setup() only for config keys
// that do not exist yet; later changes belong in the sheet tab "config".
var COCKPIT_PRIVATE = {
  webAppUrl: "https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec",
  calLectures: "<name of the subscribed timetable calendar>",
  calExams: "<name of the exams calendar>",
  homeStop: "<stop name from transport.opendata.ch>",
  campusStop: "<stop name>",
  lat: "47.0",
  lon: "8.0",
  categories: [
    { id: "math", label: "Mathematik", color: "#BFD7EA", group: "schule" },
    { id: "privat", label: "Privat", color: "#E8E2C8", group: "privat" },
  ],
};
