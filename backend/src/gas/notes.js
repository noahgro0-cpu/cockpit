/** Note pages, note images (Google Drive) and hand-picked event subjects (D28). */

var IMAGE_FOLDER_PROP = "IMAGE_FOLDER_ID";
var IMAGE_FOLDER_NAME = "Cockpit Bilder";

function writeTextRow_(tab, rowNum, values, width) {
  var sh = sheet_(tab);
  var target = rowNum || sh.getLastRow() + 1;
  if (target > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), 20);
  // Sheets evaluates "=…" even in text-formatted cells; a leading apostrophe forces text (D27).
  var row = values.map(function (v) {
    return typeof v === "string" && /^[=+\-@']/.test(v) ? "'" + v : v;
  });
  sh.getRange(target, 1, 1, width).setNumberFormat("@").setValues([row]);
}

// --- Event subjects ------------------------------------------------------------

function readEventSubjects_() {
  if (!ss_().getSheetByName("termin_faecher")) return {};
  return eventSubjectMap(readRows_("termin_faecher"));
}

/** subject: id or NO_SUBJECT = stored; null = removed (automatic assignment again). */
function setEventSubject_(key, subject) {
  var rowNum = findRow_("termin_faecher", key);
  if (subject === null) {
    if (rowNum) sheet_("termin_faecher").deleteRow(rowNum);
    return;
  }
  writeTextRow_("termin_faecher", rowNum, [key, subject, nowIso_()], EVENT_SUBJECT_COLUMNS.length);
}

// --- Note pages ----------------------------------------------------------------

function readNotes_() {
  if (!ss_().getSheetByName("notizen")) return [];
  return readRows_("notizen").map(rowToNote);
}

function isSchoolSubject_(id) {
  return settingsFromConfig(readConfig_()).categories.some(function (c) {
    return c.id === id && c.group === "schule";
  });
}

function stampLabel_() {
  var stamp = toZurichIso(new Date());
  return stamp.slice(8, 10) + "." + stamp.slice(5, 7) + ". " + stamp.slice(11, 16);
}

/** note.add (idempotent per id). */
function addNote_(p) {
  if (!isSchoolSubject_(p.subject)) throw apiError("not_found", "No school category with this id");
  var rowNum = findRow_("notizen", p.id);
  if (rowNum) return rowToNote(sheet_("notizen").getRange(rowNum, 1, 1, NOTE_COLUMNS.length).getValues()[0]);
  if (readRows_("notizen").length >= NOTE_LIMITS.pages) throw apiError("bad_request", "Zu viele Notizseiten (höchstens 300).");
  var now = nowIso_();
  var note = { id: p.id, subject: p.subject, title: p.title.trim(), html: p.html || "", createdAt: now, updatedAt: now };
  writeTextRow_("notizen", 0, noteToRow(note), NOTE_COLUMNS.length);
  return note;
}

/** note.update with conflict-safe merge of the content (see mergeEdit). */
function updateNote_(p) {
  var rowNum = findRow_("notizen", p.id);
  if (!rowNum) throw apiError("not_found", "Notizseite nicht gefunden (auf einem anderen Gerät gelöscht?)");
  var note = rowToNote(sheet_("notizen").getRange(rowNum, 1, 1, NOTE_COLUMNS.length).getValues()[0]);
  var r = applyNotePatch(note, p, nowIso_(), stampLabel_());
  if (r.conflict) log_("info", "notes", "page " + p.id + ": edited on two devices, both versions kept");
  writeTextRow_("notizen", rowNum, noteToRow(r.note), NOTE_COLUMNS.length);
  return r.note;
}

/** note.delete (idempotent). Images stay in Drive (they may be referenced again by an undo). */
function deleteNote_(p) {
  var rowNum = findRow_("notizen", p.id);
  if (rowNum) sheet_("notizen").deleteRow(rowNum);
  return { id: p.id };
}

/** One-time (schema 10): plain-text subject notes (D27) become the first page of each subject. */
function migrateSubjectNotes_() {
  if (props_().getProperty("NOTES_MIGRATED") === "1") return;
  var sh = ss_().getSheetByName("faecher");
  var rows = sh ? readRows_("faecher") : [];
  var now = nowIso_();
  var pages = [];
  rows.forEach(function (row, i) {
    var rec = rowToSubjectRecord(row);
    if (!rec.id || !rec.notes.trim()) return;
    pages.push(noteToRow({ id: Utilities.getUuid(), subject: rec.id, title: "Notizen", html: plainToHtml(rec.notes), createdAt: rec.updatedAt || now, updatedAt: now }));
    sh.getRange(i + 2, SUBJECT_COLUMNS.indexOf("notizen") + 1).setValue("");
  });
  pages.forEach(function (row) {
    writeTextRow_("notizen", 0, row, NOTE_COLUMNS.length);
  });
  props_().setProperty("NOTES_MIGRATED", "1");
  if (pages.length) log_("info", "setup", pages.length + " subject notes moved to note pages");
}

/**
 * A notes patch from a client older than D28 lands on one page per subject ("Notizen (älteres
 * Gerät)", overwritten by later autosaves) instead of the retired cell.
 */
function notesToPage_(subjectId, text) {
  if (!text.trim()) return;
  var id = "legacy-" + subjectId;
  var rowNum = findRow_("notizen", id);
  var now = nowIso_();
  var created = rowNum ? rowToNote(sheet_("notizen").getRange(rowNum, 1, 1, NOTE_COLUMNS.length).getValues()[0]).createdAt : now;
  writeTextRow_("notizen", rowNum, noteToRow({ id: id, subject: subjectId, title: "Notizen (älteres Gerät)", html: plainToHtml(text), createdAt: created, updatedAt: now }), NOTE_COLUMNS.length);
}

// --- Images (Google Drive REST, scope drive.file: only files Cockpit created) ---------

function driveFetch_(url, options) {
  var opts = Object.assign({ muteHttpExceptions: true, headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() } }, options || {});
  var res = UrlFetchApp.fetch(url, opts);
  var code = res.getResponseCode();
  // 401/403: the Drive permission (scope drive.file) is not granted yet: a clear, kept error
  // instead of endless retries (the PWA keeps the picture on the device, D28).
  if (code === 401 || code === 403) {
    // Google's reason (missing scope vs. API disabled) goes to the execution log only.
    Logger.log("Drive HTTP " + code + ": " + res.getContentText().slice(0, 500));
    throw apiError("bad_request", "Bilder sind noch nicht freigeschaltet (Google-Drive-Berechtigung fehlt, siehe STATUS).");
  }
  if (code >= 300) throw apiError("unavailable", "Google Drive antwortet mit HTTP " + code);
  return res;
}

function imageFolder_() {
  var p = props_();
  var id = p.getProperty(IMAGE_FOLDER_PROP);
  if (id) return id;
  var res = driveFetch_("https://www.googleapis.com/drive/v3/files?fields=id", {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({ name: IMAGE_FOLDER_NAME, mimeType: "application/vnd.google-apps.folder" }),
  });
  id = JSON.parse(res.getContentText()).id;
  p.setProperty(IMAGE_FOLDER_PROP, id);
  return id;
}

/** image.add (idempotent per id): stores the picture in the Drive folder "Cockpit Bilder". */
function addImage_(p) {
  if (!isSchoolSubject_(p.subject)) throw apiError("not_found", "No school category with this id");
  if (findRow_("bilder", p.id)) return { id: p.id };
  var bytes = Utilities.base64Decode(p.data);
  var folder = imageFolder_();
  var ext = p.type === "image/png" ? ".png" : p.type === "image/webp" ? ".webp" : ".jpg";
  var up = driveFetch_("https://www.googleapis.com/upload/drive/v3/files?uploadType=media&fields=id", {
    method: "post",
    contentType: p.type,
    payload: bytes,
  });
  var fileId = JSON.parse(up.getContentText()).id;
  driveFetch_("https://www.googleapis.com/drive/v3/files/" + encodeURIComponent(fileId) + "?addParents=" + encodeURIComponent(folder) + "&fields=id", {
    method: "patch",
    contentType: "application/json",
    payload: JSON.stringify({ name: p.subject + "-" + p.id + ext }),
  });
  writeTextRow_("bilder", 0, [p.id, p.subject, fileId, p.type, bytes.length, nowIso_()], IMAGE_COLUMNS.length);
  return { id: p.id };
}

/** image.get {id} -> {id, type, data(base64)}. */
function getImage_(p) {
  var rowNum = findRow_("bilder", p.id);
  if (!rowNum) throw apiError("not_found", "Bild nicht gefunden");
  var row = sheet_("bilder").getRange(rowNum, 1, 1, IMAGE_COLUMNS.length).getValues()[0];
  var res = driveFetch_("https://www.googleapis.com/drive/v3/files/" + encodeURIComponent(String(row[2])) + "?alt=media");
  return { id: p.id, type: String(row[3]), data: Utilities.base64Encode(res.getContent()) };
}

/**
 * Run once in the editor after the D28 update: asks for the new Drive permission (only files
 * Cockpit creates) and creates the folder "Cockpit Bilder".
 */
function authorizeDrive() {
  var id = imageFolder_();
  Logger.log("Drive ready, folder id " + id);
}
