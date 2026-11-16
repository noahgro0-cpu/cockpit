/**
 * API dispatcher (pure). The Apps Script layer injects storage and services via `deps`.
 * Never throws: every outcome is {ok:true,data} or {ok:false,error:{code,message}}.
 */

var AUTH_FAIL_LIMIT = 10;

function apiError(code, message) {
  var e = new Error(message);
  e.apiError = { code: code, message: message };
  return e;
}

function apiFail_(code, message) {
  return { ok: false, error: { code: code, message: message } };
}

function noPayload_(p) {
  if (p === undefined || p === null || isPlainObject(p)) return { ok: true, value: {} };
  return { ok: false, message: "payload must be an object" };
}

/**
 * event.add (D27): {calendar: "exams", title, date, kind, subject?} = all-day exam/deadline;
 * {calendar: "default", title, date, start?: "HH:MM", end?: "HH:MM", location?, subject?} = appointment.
 */
function validateEventAdd(p) {
  if (!isPlainObject(p)) return { ok: false, message: "payload must be an object" };
  if (p.calendar !== "exams" && p.calendar !== "default") return { ok: false, message: 'calendar must be "exams" or "default"' };
  if (typeof p.title !== "string" || p.title.trim() === "" || p.title.length > 200) {
    return { ok: false, message: "title must be 1-200 characters" };
  }
  if (!isIsoDate(p.date)) return { ok: false, message: "date must be ISODate" };
  if (p.calendar === "exams" && p.kind !== "exam" && p.kind !== "deadline") {
    return { ok: false, message: 'kind must be "exam" or "deadline"' };
  }
  if (p.calendar === "exams" && (p.start !== undefined || p.end !== undefined)) {
    return { ok: false, message: "exams are all-day: no start/end" };
  }
  if (p.start !== undefined && parseHhmm(p.start) === null) return { ok: false, message: "start must be HH:MM" };
  if (p.end !== undefined && (p.start === undefined || parseHhmm(p.end) === null)) {
    return { ok: false, message: "end must be HH:MM and needs start" };
  }
  if (p.location !== undefined && (typeof p.location !== "string" || p.location.length > 200)) {
    return { ok: false, message: "location must be at most 200 characters" };
  }
  if (p.subject !== undefined && (typeof p.subject !== "string" || !ID_PATTERN.test(p.subject))) {
    return { ok: false, message: "subject is invalid" };
  }
  return { ok: true, value: p };
}

/** Validated event.add payload -> {allDay, start?: Date, end?: Date} (end default +60 min, never before start). */
function eventAddSpan(p) {
  if (p.calendar === "exams" || p.start === undefined) return { allDay: true };
  var start = zurichInstant(p.date, parseHhmm(p.start));
  var end = p.end !== undefined ? zurichInstant(p.date, parseHhmm(p.end)) : null;
  if (!end || end <= start) end = new Date(start.getTime() + 60 * MS_PER_MIN);
  return { allDay: false, start: start, end: end };
}

/** briefing.preview {date?}: today up to +7 days, previewed as at the briefing time of that date. */
function validateBriefingPreview(p) {
  var v = noPayload_(p);
  if (!v.ok || !p || p.date === undefined) return v;
  if (!isIsoDate(p.date)) return { ok: false, message: "date must be ISODate" };
  return { ok: true, value: { date: p.date } };
}

function validateMailFeedback(p) {
  var v = validateIdPayload(p);
  if (!v.ok) return v;
  if (p.verdict !== "wichtig" && p.verdict !== "unwichtig") return { ok: false, message: "verdict is invalid" };
  return v;
}

/**
 * action -> {validate, write}. `write` actions run under the script lock.
 * Built lazily: Apps Script loads files in arbitrary order, so top-level code must not
 * reference functions from other files.
 */
function apiActions_() {
  return {
  ping: { validate: noPayload_, write: false },
  getState: { validate: noPayload_, write: false },
  getWidget: { validate: noPayload_, write: false },
  "todo.add": { validate: validateTodoAdd, write: true },
  "todo.update": { validate: validateTodoUpdate, write: true },
  "todo.complete": { validate: validateTodoComplete, write: true },
  "todo.delete": { validate: validateIdPayload, write: true },
  // quickAdd takes the lock only around its write, so the AI call does not block other writers.
  quickAdd: { validate: validateQuickAdd, write: false },
  // capture = quickAdd that may also create a calendar event (D22); locks itself like quickAdd.
  capture: { validate: validateCapture, write: false },
  "mail.toTodo": { validate: validateIdPayload, write: true },
  "mail.dismiss": { validate: validateIdPayload, write: true },
  "mail.feedback": { validate: validateMailFeedback, write: true },
  "event.add": { validate: validateEventAdd, write: true },
  "settings.update": { validate: validateSettingsUpdate, write: true },
  "subject.update": { validate: validateSubjectUpdate, write: true },
  // Sent by the iOS shortcut; stored in a script property, so no sheet lock needed.
  "location.update": { validate: validateLocationUpdate, write: false },
  "briefing.preview": { validate: validateBriefingPreview, write: false },
  };
}

/** Compares two strings in time independent of where they differ. */
function safeEqual(a, b) {
  // The key length is fixed and public knowledge, so an early length check leaks nothing.
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * deps: {
 *   apiKey: string,
 *   authFailures(): number, registerAuthFailure(): void,
 *   handlers: {[action]: (payload) => data},
 *   withLock(fn): result   // throws apiError("busy") if the lock is not available
 *   onError(err): void
 * }
 */
function handleApiRequest(bodyText, deps) {
  try {
    if (deps.authFailures() >= AUTH_FAIL_LIMIT) return apiFail_("unauthorized", "Too many failed attempts, try later");
    var req;
    try {
      req = JSON.parse(bodyText);
    } catch (e) {
      return apiFail_("bad_request", "Body is not valid JSON");
    }
    if (!isPlainObject(req)) return apiFail_("bad_request", "Body must be a JSON object");
    if (!deps.apiKey || !safeEqual(req.key, deps.apiKey)) {
      deps.registerAuthFailure();
      return apiFail_("unauthorized", "Invalid key");
    }
    var actions = apiActions_();
    var spec = Object.prototype.hasOwnProperty.call(actions, req.action) ? actions[req.action] : null;
    if (!spec) return apiFail_("bad_request", "Unknown action");
    var v = spec.validate(req.payload);
    if (!v.ok) return apiFail_("bad_request", v.message);
    var handler = deps.handlers[req.action];
    if (!handler) return apiFail_("bad_request", "Action not available yet: " + req.action);
    var data = spec.write
      ? deps.withLock(function () {
          return handler(v.value);
        })
      : handler(v.value);
    return { ok: true, data: data };
  } catch (err) {
    if (err && err.apiError) return { ok: false, error: err.apiError };
    try {
      deps.onError(err);
    } catch (ignored) {
      // logging must never break the response
    }
    return apiFail_("internal", "Internal error");
  }
}
