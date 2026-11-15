// Copy to src/private.local.js (git-ignored) and fill in. Read by setup() only for config keys
// that do not exist yet; later changes belong in the sheet tab "config".
var COCKPIT_PRIVATE = {
  webAppUrl: "https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec",
  calLectures: "<name of the subscribed timetable calendar>",
  calExams: "<name of the exams calendar>",
  mailAccounts: [["Schule", "musterschule.example"], ["Privat", "@me"], ["Geschäftlich", "*"]],
  calRoutine: "<calendars shown muted, comma-separated, e.g. week numbers>",
  homeStop: "<stop name from transport.opendata.ch>",
  campusStop: "<stop name>",
  lat: "47.0",
  lon: "8.0",
  homeName: "Musterdorf",
  campusLat: "47.1",
  campusLon: "8.1",
  campusName: "Campusstadt",
  categories: [
    { id: "math", label: "Mathematik", color: "#BFD7EA", group: "schule" },
    { id: "privat", label: "Privat", color: "#E8E2C8", group: "privat" },
  ],
  // Mail categories = your Gmail labels (exact names); sensitive ones never go to the AI.
  mailCategories: ["Studium", "Privat", "Rechnungen", "Gesundheit", "Unwichtig"],
  sensitiveCategories: ["Gesundheit"],
  junkCategory: "Unwichtig",
  // Starter rules for the tab "regeln" (only while it is empty). First match wins.
  // [aktiv, feld, muster, importance, kategorie, sensibel, push, kommentar]
  rules: [
    ["ja", "subject", "/arztbericht|befund/", "", "Gesundheit", "ja", "nein", "never sent to the AI"],
    ["ja", "from", "university.example", "", "Studium", "nein", "nein", "category fixed, AI rates importance"],
    ["ja", "from", "newsletter", 0, "Unwichtig", "nein", "nein", ""],
  ],
};
