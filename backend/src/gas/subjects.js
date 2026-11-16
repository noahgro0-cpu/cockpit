/** Subjects ("Fächer", D27): sheet tab `faecher`, one row per school category. */

/** Stored subject records; [] while the tab does not exist yet (before the schema update). */
function readSubjectRecords_() {
  if (!ss_().getSheetByName("faecher")) return [];
  return readRows_("faecher").map(rowToSubjectRecord);
}

/** Matchers for keyword assignment of events and rule-based to-dos. */
function subjectMatchers_(config) {
  return subjectMatchers(settingsFromConfig(config || readConfig_()).categories, readSubjectRecords_());
}

/** subject.update (caller holds the write lock). Only school categories have a subject page. */
function updateSubject_(p) {
  var config = readConfig_();
  var isSubject = settingsFromConfig(config).categories.some(function (c) {
    return c.id === p.id && c.group === "schule";
  });
  if (!isSubject) throw apiError("not_found", "No school category with this id");
  var rowNum = findRow_("faecher", p.id);
  var rec = rowNum ? rowToSubjectRecord(sheet_("faecher").getRange(rowNum, 1, 1, SUBJECT_COLUMNS.length).getValues()[0]) : null;
  var stamp = toZurichIso(new Date());
  var label = stamp.slice(8, 10) + "." + stamp.slice(5, 7) + ". " + stamp.slice(11, 16);
  var r = applySubjectPatch(rec, p, nowIso_(), label);
  if (r.conflict) log_("info", "subjects", "subject " + p.id + ": edited on two devices, both versions kept");
  var sh = sheet_("faecher");
  var target = rowNum || sh.getLastRow() + 1;
  if (target > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), 20);
  // Plain text: Sheets evaluates "=…" even in text-formatted cells (live: #ERROR!); a leading
  // apostrophe forces text and is not part of the read value (D27).
  var row = subjectRecordToRow(r.record).map(function (v) {
    return typeof v === "string" && /^[=+\-@']/.test(v) ? "'" + v : v;
  });
  sh.getRange(target, 1, 1, SUBJECT_COLUMNS.length).setNumberFormat("@").setValues([row]);
  return subjectFromRecord(r.record);
}

/** One-time (schema 9): starter keywords per subject from private.local.js (only while the tab is empty). */
function seedSubjects_() {
  var seeds = privateDefaults_().subjects;
  if (!seeds || typeof seeds !== "object") return;
  if (readRows_("faecher").length) return;
  var rows = Object.keys(seeds).map(function (id) {
    return subjectRecordToRow({ id: id, keywords: parseKeywords(seeds[id].join(",")), info: "", links: [], notes: "", updatedAt: "" });
  });
  appendRows_("faecher", rows);
  log_("info", "setup", rows.length + " subject rows added");
}
