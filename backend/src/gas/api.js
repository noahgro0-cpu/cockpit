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
      return quickAdd_(p);
    },
    "mail.toTodo": function (p) {
      return mailToTodo_(p.id);
    },
    "mail.dismiss": function (p) {
      var rec = readMailIndex_().byId[p.id];
      if (!rec) throw apiError("not_found", "Mail not found");
      if (!rec.dismissed) setCells_("mails", rec.rowNum, { dismissed: true });
      return { id: p.id };
    },
    "mail.feedback": function (p) {
      return mailFeedback_(p.id, p.verdict);
    },
    "settings.update": function (p) {
      settingsToConfigPairs(p).forEach(function (kv) {
        setConfigValue_(kv[0], kv[1]);
      });
      return settingsFromConfig(readConfig_());
    },
    "event.add": function (p) {
      return addExamEvent_(p);
    },
    "location.update": function (p) {
      return saveLocation_(p);
    },
    "briefing.preview": function (p) {
      var now = new Date();
      var today = toZurichDate(now);
      if (p.date && (p.date < today || p.date > addDaysIso(today, 7))) {
        throw apiError("bad_request", "date must be today to +7 days");
      }
      if (p.date && p.date !== today) {
        now = zurichInstant(p.date, parseHhmm(briefingTimeFor(p.date, readConfig_())) || 390);
      }
      return { text: briefingTextNow_(now) };
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

// --- Phase 1b actions ---------------------------------------------------------

/**
 * quickAdd {text, id?}: AI splits the text into title/due/category; fallback = whole text as title.
 * Idempotent when the client sends an id. The AI call runs outside the write lock.
 */
function quickAdd_(p) {
  var id = p.id || Utilities.getUuid();
  if (p.id) {
    var existing = loadTodoRecord_(p.id);
    if (existing) return existing.todo;
  }
  var text = p.text.trim();
  var fields = null;
  var config = readConfig_();
  if (aiAvailable_(config) && !isSensitiveText(text, loadRules_())) {
    var now = new Date();
    var cats = settingsFromConfig(config).categories;
    var res = callGemini_(buildQuickAddRequest(text, now, cats), config);
    if (res.ok) fields = parseQuickAddResult(res.text, now, cats);
    if (!fields) log_("info", "quickAdd", "AI result unusable, fallback used");
  }
  var payload = fields
    ? Object.assign({ id: id }, fields)
    : { id: id, title: text.slice(0, TODO_LIMITS.title) };
  return withWriteLock_(function () {
    var again = loadTodoRecord_(id);
    if (again) return again.todo;
    return saveTodo_(newTodo(payload, nowIso_(), "quick"), "", 0);
  });
}

/** mail.toTodo: idempotent; reuses the mail's or the thread's existing to-do. */
function mailToTodo_(mailId) {
  var idx = readMailIndex_();
  var rec = idx.byId[mailId];
  if (!rec) throw apiError("not_found", "Mail not found");
  var candidates = [rec.todoId].concat(idx.list.filter(function (m) {
    return m.threadId === rec.threadId && m.todoId;
  }).map(function (m) {
    return m.todoId;
  }));
  for (var i = 0; i < candidates.length; i++) {
    var existing = candidates[i] && loadTodoRecord_(candidates[i]);
    if (existing) {
      if (rec.todoId !== existing.todo.id) setCells_("mails", rec.rowNum, { todoId: existing.todo.id });
      return existing.todo;
    }
  }
  var todo = todoFromMail(rec, Utilities.getUuid(), nowIso_(), "");
  saveTodo_(todo, "", 0);
  setCells_("mails", rec.rowNum, { todoId: todo.id });
  return todo;
}

/**
 * mail.feedback: sender rule at the top of `regeln` (first match wins). Repeating the same
 * feedback updates the existing rule for that sender instead of adding a second one.
 */
function mailFeedback_(mailId, verdict) {
  var idx = readMailIndex_();
  var rec = idx.byId[mailId];
  if (!rec) throw apiError("not_found", "Mail not found");
  if (!rec.fromEmail) throw apiError("bad_request", "Mail has no sender address");
  var config = readConfig_();
  var raw = readRowsRaw_("regeln");
  var fr = feedbackRule(rec, verdict, raw.rows, mailConfig(config), toZurichDate(new Date()));
  var sh = sheet_("regeln");
  if (fr.matchIndex >= 0) {
    sh.getRange(raw.rowNums[fr.matchIndex], 1, 1, fr.row.length).setValues([fr.row]);
  } else {
    sh.insertRowBefore(2);
    sh.getRange(2, 1, 1, fr.row.length).setNumberFormat("@").setValues([fr.row]);
  }
  setCells_("mails", rec.rowNum, {
    importance: verdict === "wichtig" ? Math.max(2, rec.importance) : 0,
    category: fr.row[4] || rec.category,
    classifiedBy: "rule",
  });
  return { ruleAdded: fr.matchIndex < 0 };
}
