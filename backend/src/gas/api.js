/** Web app entry points and action handlers. */

var AUTH_FAIL_CACHE_KEY = "authFailures";

function doPost(e) {
  var result;
  try {
    var body = e && e.postData ? e.postData.contents : "";
    result = handleApiRequest(body, apiDeps_());
  } catch (err) {
    result = { ok: false, error: { code: "internal", message: "Internal error" } };
  }
  return jsonOutput_(result);
}

function doGet() {
  return jsonOutput_({ ok: false, error: { code: "bad_request", message: "Use POST" } });
}

function jsonOutput_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function apiDeps_() {
  var cache = CacheService.getScriptCache();
  return {
    apiKey: props_().getProperty("API_KEY") || "",
    authFailures: function () {
      return Number(cache.get(AUTH_FAIL_CACHE_KEY)) || 0;
    },
    registerAuthFailure: function () {
      cache.put(AUTH_FAIL_CACHE_KEY, String((Number(cache.get(AUTH_FAIL_CACHE_KEY)) || 0) + 1), 3600);
    },
    withLock: withWriteLock_,
    onError: function (err) {
      log_("error", "api", err);
    },
    handlers: apiHandlers_(),
  };
}

function withWriteLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(8000)) throw apiError("busy", "Backend busy, please retry");
  try {
    var result = fn();
    invalidateStateCache_();
    return result;
  } finally {
    lock.releaseLock();
  }
}

function nowIso_() {
  return toZurichIso(new Date());
}

// --- To-do storage ----------------------------------------------------------

function loadTodoRecord_(id) {
  var rowNum = findRow_("todos", id);
  if (!rowNum) return null;
  var row = sheet_("todos").getRange(rowNum, 1, 1, TODO_COLUMNS.length).getValues()[0];
  return { todo: rowToTodo(row), remindedAt: row[TODO_COLUMNS.indexOf("remindedAt")], rowNum: rowNum };
}

function requireTodo_(id) {
  var rec = loadTodoRecord_(id);
  if (!rec) throw apiError("not_found", "Todo not found");
  return rec;
}

function saveTodo_(todo, remindedAt, rowNum) {
  writeRow_("todos", todoToRow(todo, remindedAt), rowNum);
  return todo;
}

// --- Handlers ---------------------------------------------------------------

function apiHandlers_() {
  return {
    ping: function () {
      return { time: nowIso_() };
    },
    getState: function () {
      return getStateCached_();
    },
    getWidget: function () {
      return buildWidget(getStateCached_(), new Date());
    },
    "todo.add": function (p) {
      var existing = loadTodoRecord_(p.id);
      if (existing) return existing.todo; // idempotent retry
      return saveTodo_(newTodo(p, nowIso_(), "manual"), "", 0);
    },
    "todo.update": function (p) {
      var rec = requireTodo_(p.id);
      var r = applyTodoPatch(rec.todo, p.patch, nowIso_());
      return saveTodo_(r.todo, r.resetReminder ? "" : rec.remindedAt, rec.rowNum);
    },
    "todo.complete": function (p) {
      var rec = requireTodo_(p.id);
      return saveTodo_(setTodoDone(rec.todo, p.done, nowIso_()), rec.remindedAt, rec.rowNum);
    },
    "todo.delete": function (p) {
      var rowNum = findRow_("todos", p.id);
      if (rowNum) sheet_("todos").deleteRow(rowNum); // idempotent: deleting twice is fine
      return { id: p.id };
    },
    quickAdd: function (p) {
      // Phase 1a: rule-free fallback. AI parsing follows in phase 1b.
      var title = p.text.trim().slice(0, TODO_LIMITS.title);
      return saveTodo_(newTodo({ id: Utilities.getUuid(), title: title }, nowIso_(), "quick"), "", 0);
    },
    "event.add": function (p) {
      return addExamEvent_(p);
    },
  };
}

// --- State ------------------------------------------------------------------

function getStateCached_() {
  var cached = cacheGetChunked_(STATE_CACHE_KEY);
  if (cached) return JSON.parse(cached);
  var state = buildCurrentState_();
  cachePutChunked_(STATE_CACHE_KEY, JSON.stringify(state), 60);
  return state;
}

function aiStatus_(config) {
  var p = props_();
  if (config.aiEnabled !== "true" || !p.getProperty("GEMINI_API_KEY")) return "off";
  return p.getProperty("AI_STATUS") === "limited" ? "limited" : "ok";
}

function buildCurrentState_() {
  var now = new Date();
  var config = readConfig_();
  var p = props_();
  var cal = readCalendarEvents_(config, now);
  var briefing = null;
  try {
    briefing = JSON.parse(p.getProperty("BRIEFING") || "null");
  } catch (e) {
    briefing = null;
  }
  return buildState({
    now: now,
    health: {
      lastTick: p.getProperty("LAST_TICK") || null,
      lastMailSync: p.getProperty("LAST_MAIL_SYNC") || null,
      ai: aiStatus_(config),
      mode: config.mode === "active" ? "active" : "observe",
      errors24h: countRecentErrors(readRows_("log"), now),
    },
    events: cal.events,
    exams: cal.exams,
    todos: readRows_("todos").map(rowToTodo),
    mails: readRows_("mails").map(rowToMail),
    briefing: briefing,
    settings: settingsFromConfig(config),
  });
}
