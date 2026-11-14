/** To-do model: sheet row mapping, validation and state transitions (pure). */

var TODO_COLUMNS = [
  "id", "title", "notes", "category", "due", "dueHasTime", "remindAt", "remindedAt",
  "priority", "status", "source", "mailId", "createdAt", "updatedAt", "doneAt",
];

var TODO_LIMITS = { title: 200, notes: 2000, category: 60 };
var ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

function toBool(v) {
  return v === true || v === "TRUE" || v === "true" || v === 1 || v === "1";
}

function toPriority_(v) {
  var n = Number(v);
  return n === 1 || n === 2 ? n : 0;
}

/** Sheet row (array in TODO_COLUMNS order) -> Todo. Optional empty fields are omitted. */
function rowToTodo(row) {
  var r = {};
  for (var i = 0; i < TODO_COLUMNS.length; i++) r[TODO_COLUMNS[i]] = row[i];
  var t = {
    id: String(r.id),
    title: String(r.title),
    dueHasTime: toBool(r.dueHasTime),
    priority: toPriority_(r.priority),
    status: r.status === "done" ? "done" : "open",
    source: r.source === "quick" || r.source === "mail" ? r.source : "manual",
    createdAt: normalizeDateCell(r.createdAt, false),
    updatedAt: normalizeDateCell(r.updatedAt, false),
  };
  if (r.notes !== "" && r.notes != null) t.notes = String(r.notes);
  if (r.category !== "" && r.category != null) t.category = String(r.category);
  var due = normalizeDateCell(r.due, !toBool(r.dueHasTime));
  if (due) t.due = due;
  var remindAt = normalizeDateCell(r.remindAt, false);
  if (remindAt) t.remindAt = remindAt;
  if (r.mailId !== "" && r.mailId != null) t.mailId = String(r.mailId);
  var doneAt = normalizeDateCell(r.doneAt, false);
  if (doneAt) t.doneAt = doneAt;
  return t;
}

/** Todo (+ internal remindedAt) -> sheet row. */
function todoToRow(todo, remindedAt) {
  var t = Object.assign({}, todo, { remindedAt: remindedAt || "" });
  return TODO_COLUMNS.map(function (c) {
    var v = t[c];
    return v === undefined || v === null ? "" : v;
  });
}

function fail_(message) {
  return { ok: false, message: message };
}

function checkText_(value, field, required) {
  if (value === undefined || value === null) return required ? field + " is required" : null;
  if (typeof value !== "string") return field + " must be a string";
  if (required && value.trim() === "") return field + " must not be empty";
  if (value.length > TODO_LIMITS[field]) return field + " is longer than " + TODO_LIMITS[field] + " characters";
  return null;
}

function checkDue_(due) {
  if (due === undefined || due === null) return null;
  return isIsoDate(due) || isIsoDateTime(due) ? null : "due must be ISODate or ISODateTime";
}

function checkPriority_(p) {
  if (p === undefined) return null;
  return p === 0 || p === 1 || p === 2 ? null : "priority must be 0, 1 or 2";
}

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/** Validates a `todo.add` payload. Returns {ok, value|message}. */
function validateTodoAdd(p) {
  if (!isPlainObject(p)) return fail_("payload must be an object");
  if (typeof p.id !== "string" || !ID_PATTERN.test(p.id)) return fail_("id must match " + ID_PATTERN);
  var err =
    checkText_(p.title, "title", true) || checkText_(p.notes, "notes", false) ||
    checkText_(p.category, "category", false) || checkDue_(p.due) || checkPriority_(p.priority);
  if (err) return fail_(err);
  if (p.dueHasTime !== undefined && typeof p.dueHasTime !== "boolean") return fail_("dueHasTime must be boolean");
  if (p.remindAt !== undefined && !isIsoDateTime(p.remindAt)) return fail_("remindAt must be ISODateTime");
  return { ok: true, value: p };
}

var PATCH_FIELDS = ["title", "notes", "category", "due", "dueHasTime", "remindAt", "priority"];

/** Validates a `todo.update` payload {id, patch}. */
function validateTodoUpdate(p) {
  if (!isPlainObject(p)) return fail_("payload must be an object");
  if (typeof p.id !== "string" || !ID_PATTERN.test(p.id)) return fail_("id is invalid");
  var patch = p.patch;
  if (!isPlainObject(patch)) return fail_("patch must be an object");
  var keys = Object.keys(patch);
  if (keys.length === 0) return fail_("patch is empty");
  for (var i = 0; i < keys.length; i++) {
    if (PATCH_FIELDS.indexOf(keys[i]) < 0) return fail_("patch field not allowed: " + keys[i]);
  }
  if (patch.title === null) return fail_("title cannot be cleared");
  var err =
    checkText_(patch.title, "title", patch.title !== undefined) || checkText_(patch.notes, "notes", false) ||
    checkText_(patch.category, "category", false) || checkDue_(patch.due) || checkPriority_(patch.priority);
  if (err) return fail_(err);
  if (patch.dueHasTime !== undefined && typeof patch.dueHasTime !== "boolean") return fail_("dueHasTime must be boolean");
  if (patch.remindAt !== undefined && patch.remindAt !== null && !isIsoDateTime(patch.remindAt)) {
    return fail_("remindAt must be ISODateTime or null");
  }
  return { ok: true, value: p };
}

function validateIdPayload(p) {
  if (!isPlainObject(p)) return fail_("payload must be an object");
  if (typeof p.id !== "string" || !ID_PATTERN.test(p.id)) return fail_("id is invalid");
  return { ok: true, value: p };
}

function validateTodoComplete(p) {
  var v = validateIdPayload(p);
  if (!v.ok) return v;
  if (typeof p.done !== "boolean") return fail_("done must be boolean");
  return v;
}

function validateQuickAdd(p) {
  if (!isPlainObject(p)) return fail_("payload must be an object");
  if (typeof p.text !== "string" || p.text.trim() === "") return fail_("text is required");
  if (p.text.length > 500) return fail_("text is longer than 500 characters");
  // Optional client UUID makes retries idempotent; Siri shortcuts may send only {text}.
  if (p.id !== undefined && (typeof p.id !== "string" || !ID_PATTERN.test(p.id))) return fail_("id is invalid");
  return { ok: true, value: p };
}

/** Builds a new Todo from a validated `todo.add` payload. dueHasTime follows the due format. */
function newTodo(p, nowIso, source) {
  var t = {
    id: p.id,
    title: p.title.trim(),
    dueHasTime: p.due ? isIsoDateTime(p.due) : false,
    priority: p.priority === undefined ? 0 : p.priority,
    status: "open",
    source: source || "manual",
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  if (p.notes) t.notes = p.notes;
  if (p.category) t.category = p.category;
  if (p.due) t.due = p.due;
  if (p.remindAt) t.remindAt = p.remindAt;
  if (p.mailId) t.mailId = p.mailId;
  return t;
}

/**
 * Applies a validated patch. Returns {todo, resetReminder}; resetReminder is true when
 * due or remindAt changed, so a pending reminder is sent again.
 */
function applyTodoPatch(todo, patch, nowIso) {
  var t = Object.assign({}, todo);
  Object.keys(patch).forEach(function (k) {
    var v = patch[k];
    if (v === null || v === "") delete t[k];
    else t[k] = k === "title" ? v.trim() : v;
  });
  // dueHasTime is always derived from the due format so the two can never disagree.
  t.dueHasTime = t.due ? isIsoDateTime(t.due) : false;
  t.updatedAt = nowIso;
  return { todo: t, resetReminder: "due" in patch || "remindAt" in patch };
}

function setTodoDone(todo, done, nowIso) {
  var t = Object.assign({}, todo, { status: done ? "done" : "open", updatedAt: nowIso });
  if (done) t.doneAt = todo.status === "done" && todo.doneAt ? todo.doneAt : nowIso;
  else delete t.doneAt;
  return t;
}
