/**
 * Note pages, note images and event edits (D28, pure).
 *
 * Note pages: tab `notizen`, one row per page of a subject. `inhalt` is HTML written by the PWA's
 * editor (Tiptap). The backend never renders it: the PWA parses it through the editor schema,
 * which drops every element and attribute it does not know (no raw innerHTML anywhere).
 * Images live in Google Drive (scope drive.file); the HTML only references them by id
 * (<img data-image="…">), the tab `bilder` maps id -> Drive file.
 * Event subjects chosen by hand: tab `termin_faecher`, keyed by the iCalUID, so one choice covers
 * every instance of a series and works for read-only (subscribed) calendars too.
 */

var NOTE_COLUMNS = ["id", "fach", "titel", "inhalt", "erstellt", "updatedAt"];
var IMAGE_COLUMNS = ["id", "fach", "dateiId", "typ", "bytes", "erstellt"];
var EVENT_SUBJECT_COLUMNS = ["schluessel", "fach", "updatedAt"];
// A sheet cell holds at most 50 000 characters; the rest is headroom for a merge marker.
var NOTE_LIMITS = { title: 100, html: 45000, pages: 300 };
var IMAGE_LIMITS = { base64: 2800000, types: ["image/jpeg", "image/png", "image/webp"] };
var NO_SUBJECT = "-";
var EVENT_ID_PATTERN = /^[^\s]{1,1000}_\d{1,15}$/;

/** "abc@google.com_1700000000000" -> "abc@google.com" (the iCalUID, shared by a series). */
function eventKey(id) {
  var s = String(id || "");
  var at = s.lastIndexOf("_");
  return at > 0 ? s.slice(0, at) : s;
}

/** Sheet rows -> {iCalUID: subject id or NO_SUBJECT}. */
function eventSubjectMap(rows) {
  var map = {};
  (rows || []).forEach(function (r) {
    var key = String(r[0] || "").trim();
    var subject = String(r[1] || "").trim();
    if (key && subject) map[key] = subject;
  });
  return map;
}

var MERGE_TEXT = "Auch auf einem anderen Gerät geändert (";

/**
 * Applies an edit of a long text with conflict detection. baseHash = textHash of the text the edit
 * started from. If the stored text changed meanwhile (another device), both versions are kept,
 * separated by a marker; when the other device keeps editing its own part after such a merge,
 * only that part is replaced (never appended again). `html` picks an HTML marker the editor keeps
 * byte for byte (<hr><p><em>…</em></p> is how Tiptap serialises it).
 * Returns {text, conflict}.
 */
function mergeEdit(stored, incoming, baseHash, stampLabel, max, html) {
  var open = html ? "<hr><p><em>" + MERGE_TEXT : "\n\n--- " + MERGE_TEXT;
  var close = html ? ")</em></p>" : ") ---\n";
  var at = stored.lastIndexOf(open);
  var tail = at >= 0 ? stored.indexOf(close, at) : -1;
  var stale = baseHash && baseHash !== textHash(stored);
  if (stale && tail >= 0 && textHash(stored.slice(tail + close.length)) === baseHash) {
    return { text: (stored.slice(0, tail + close.length) + incoming).slice(0, max), conflict: false };
  }
  if (stale && incoming !== stored && stored !== "") {
    return { text: (stored + open + stampLabel + close + incoming).slice(0, max), conflict: true };
  }
  return { text: incoming, conflict: false };
}

/** Plain text (subject notes before D28) -> editor HTML: one paragraph per line, escaped. */
function plainToHtml(text) {
  var esc = function (s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  };
  return String(text || "")
    .split("\n")
    .map(function (line) {
      return line ? "<p>" + esc(line) + "</p>" : "<p></p>";
    })
    .join("");
}

function rowToNote(row) {
  return {
    id: String(row[0] || "").trim(),
    subject: String(row[1] || "").trim(),
    title: String(row[2] == null ? "" : row[2]),
    html: String(row[3] == null ? "" : row[3]),
    createdAt: normalizeDateCell(row[4], false) || null,
    updatedAt: normalizeDateCell(row[5], false) || null,
  };
}

function noteToRow(n) {
  return [n.id, n.subject, n.title, n.html, n.createdAt || "", n.updatedAt || ""];
}

/** Pages of existing school subjects, newest first. */
function notesForState(notes, categories) {
  var school = {};
  (categories || []).forEach(function (c) {
    if (c.group === "schule") school[c.id] = true;
  });
  return (notes || [])
    .filter(function (n) {
      return n.id && school[n.subject];
    })
    .sort(function (a, b) {
      return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
    });
}

function checkNoteTitle_(t, required) {
  if (t === undefined) return required ? "title is required" : null;
  if (typeof t !== "string" || /\n/.test(t) || t.length > NOTE_LIMITS.title) return "title must be one line of at most 100 characters";
  return null;
}

function checkNoteHtml_(h) {
  if (h === undefined) return null;
  if (typeof h !== "string") return "html must be a string";
  return h.length > NOTE_LIMITS.html ? "Die Seite ist zu lang (höchstens 45 000 Zeichen): bitte auf eine neue Seite aufteilen." : null;
}

/** note.add {id, subject, title, html?} */
function validateNoteAdd(p) {
  if (!isPlainObject(p)) return fail_("payload must be an object");
  if (typeof p.id !== "string" || !ID_PATTERN.test(p.id)) return fail_("id is invalid");
  if (typeof p.subject !== "string" || !ID_PATTERN.test(p.subject)) return fail_("subject is invalid");
  var err = checkNoteTitle_(p.title, true) || checkNoteHtml_(p.html);
  return err ? fail_(err) : { ok: true, value: p };
}

/** note.update {id, patch: {title?, html?}, base?: {html}} */
function validateNoteUpdate(p) {
  if (!isPlainObject(p)) return fail_("payload must be an object");
  if (typeof p.id !== "string" || !ID_PATTERN.test(p.id)) return fail_("id is invalid");
  if (!isPlainObject(p.patch) || !Object.keys(p.patch).length) return fail_("patch must be a non-empty object");
  var keys = Object.keys(p.patch);
  for (var i = 0; i < keys.length; i++) {
    if (keys[i] !== "title" && keys[i] !== "html") return fail_("patch field not allowed: " + keys[i]);
  }
  var err = checkNoteTitle_(p.patch.title, false) || checkNoteHtml_(p.patch.html);
  if (err) return fail_(err);
  if (p.base !== undefined && (!isPlainObject(p.base) || !/^[0-9a-f]{8}$/.test(p.base.html))) return fail_("base is invalid");
  return { ok: true, value: p };
}

/** Applies a validated note.update to a stored page. Returns {note, conflict}. */
function applyNotePatch(note, payload, nowIso, stampLabel) {
  var n = Object.assign({}, note);
  var conflict = false;
  if (payload.patch.title !== undefined) n.title = payload.patch.title.trim();
  if (payload.patch.html !== undefined) {
    var base = payload.base ? payload.base.html : "";
    var r = mergeEdit(n.html, payload.patch.html, base, stampLabel, NOTE_LIMITS.html + 4000, true);
    n.html = r.text;
    conflict = r.conflict;
  }
  n.updatedAt = nowIso;
  return { note: n, conflict: conflict };
}

/** image.add {id, subject, type, data(base64)} */
function validateImageAdd(p) {
  if (!isPlainObject(p)) return fail_("payload must be an object");
  if (typeof p.id !== "string" || !ID_PATTERN.test(p.id)) return fail_("id is invalid");
  if (typeof p.subject !== "string" || !ID_PATTERN.test(p.subject)) return fail_("subject is invalid");
  if (IMAGE_LIMITS.types.indexOf(p.type) < 0) return fail_("type must be image/jpeg, image/png or image/webp");
  if (typeof p.data !== "string" || !p.data || p.data.length > IMAGE_LIMITS.base64 || !/^[A-Za-z0-9+/]+=*$/.test(p.data)) {
    return fail_("data must be base64 (at most about 2 MB)");
  }
  return { ok: true, value: p };
}

function validateEventRef_(p) {
  if (!isPlainObject(p)) return "payload must be an object";
  if (typeof p.id !== "string" || !EVENT_ID_PATTERN.test(p.id)) return "id is invalid";
  if (typeof p.calendar !== "string" || !p.calendar || p.calendar.length > 200) return "calendar is invalid";
  return null;
}

/**
 * event.update {id, calendar, patch: {title?, date?, start?, end?, location?, kind?, subject?}}.
 * date/start/end describe the new time together: `date` alone = all-day, with `start` = timed
 * (end default +60 min). subject: id = chosen by hand, "-" = none, null = automatic (keywords).
 */
function validateEventUpdate(p) {
  var err = validateEventRef_(p);
  if (err) return fail_(err);
  var patch = p.patch;
  if (!isPlainObject(patch) || !Object.keys(patch).length) return fail_("patch must be a non-empty object");
  var allowed = ["title", "date", "start", "end", "location", "kind", "subject"];
  var keys = Object.keys(patch);
  for (var i = 0; i < keys.length; i++) {
    if (allowed.indexOf(keys[i]) < 0) return fail_("patch field not allowed: " + keys[i]);
  }
  if (patch.title !== undefined && (typeof patch.title !== "string" || !patch.title.trim() || patch.title.length > 200)) {
    return fail_("title must be 1-200 characters");
  }
  if ((patch.start !== undefined || patch.end !== undefined) && patch.date === undefined) return fail_("start/end need date");
  if (patch.date !== undefined && !isIsoDate(patch.date)) return fail_("date must be ISODate");
  if (patch.start !== undefined && parseHhmm(patch.start) === null) return fail_("start must be HH:MM");
  if (patch.end !== undefined && (patch.start === undefined || parseHhmm(patch.end) === null)) return fail_("end must be HH:MM and needs start");
  if (patch.location !== undefined && (typeof patch.location !== "string" || patch.location.length > 200)) {
    return fail_("location must be at most 200 characters");
  }
  if (patch.kind !== undefined && patch.kind !== "exam" && patch.kind !== "deadline") return fail_('kind must be "exam" or "deadline"');
  if (patch.subject !== undefined && patch.subject !== null && patch.subject !== NO_SUBJECT &&
    (typeof patch.subject !== "string" || !ID_PATTERN.test(patch.subject))) {
    return fail_("subject is invalid");
  }
  return { ok: true, value: p };
}

function validateEventDelete(p) {
  var err = validateEventRef_(p);
  return err ? fail_(err) : { ok: true, value: p };
}

/** Time part of an event.update patch -> {allDay, start?: Date, end?: Date} or null (no time change). */
function eventPatchSpan(patch) {
  if (patch.date === undefined) return null;
  if (patch.start === undefined) return { allDay: true };
  return eventAddSpan({ calendar: "default", date: patch.date, start: patch.start, end: patch.end });
}
