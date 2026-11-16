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
    capture: function (p) {
      return capture_(p, true);
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
    "subject.update": function (p) {
      return updateSubject_(p);
    },
    "event.update": function (p) {
      return updateEvent_(p);
    },
    "event.delete": function (p) {
      return deleteEvent_(p);
    },
    "note.add": function (p) {
      return addNote_(p);
    },
    "note.update": function (p) {
      return updateNote_(p);
    },
    "note.delete": function (p) {
      return deleteNote_(p);
    },
    "image.add": function (p) {
      return addImage_(p);
    },
    "image.get": function (p) {
      return getImage_(p);
    },
    "settings.update": function (p) {
      settingsToConfigPairs(p).forEach(function (kv) {
        setConfigValue_(kv[0], kv[1]);
      });
      return settingsFromConfig(readConfig_());
    },
    "event.add": function (p) {
      return addEvent_(p);
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
    subjects: readSubjectRecords_(),
    eventSubjects: readEventSubjects_(),
    notes: readNotes_(),
  });
}

// --- Phase 1b actions ---------------------------------------------------------

/** quickAdd {text, id?}: always exactly one to-do (contract unchanged); same parser as capture. */
function quickAdd_(p) {
  return capture_(p, false).todo;
}

var CAPTURE_CACHE_PREFIX = "capture:";

/**
 * capture {text, id?, dryRun?}: the AI splits the sentence into up to 3 to-dos and/or calendar
 * events (D22, D23); fallback = whole text as one to-do. The AI call runs outside the write lock.
 * Idempotent with a client id: the whole result is cached for 6 h; to-dos are additionally keyed
 * by the client id (first) and derived ids, so a retry after a partial failure only adds what is missing.
 */
function capture_(p, allowEvents) {
  var cache = CacheService.getScriptCache();
  var cacheKey = p.id ? CAPTURE_CACHE_PREFIX + p.id : "";
  if (p.id && !p.dryRun) {
    var cached = allowEvents && cache.get(cacheKey);
    if (cached) return JSON.parse(cached);
    if (!allowEvents) {
      var existing = loadTodoRecord_(p.id);
      if (existing) return captureResponse([{ type: "todo", todo: existing.todo }]);
    }
  }
  var text = p.text.trim();
  var now = new Date();
  var config = readConfig_();
  var parsed = null;
  if (aiAvailable_(config) && !isSensitiveText(text, loadRules_())) {
    var kw = {};
    subjectMatchers_(config).forEach(function (m) {
      kw[m.id] = m.keywords;
    });
    var cats = settingsFromConfig(config).categories.map(function (c) {
      return kw[c.id] && kw[c.id].length ? Object.assign({ keywords: kw[c.id] }, c) : c;
    });
    var req = buildCaptureRequest(text, now, cats);
    // One retry: a failed or unusable answer would otherwise store the whole sentence as title.
    for (var attempt = 0; attempt < 2 && !parsed; attempt++) {
      if (attempt) Utilities.sleep(1500);
      var res = callGemini_(req, config);
      if (res.ok) parsed = parseCaptureResult(res.text, now, cats, text, allowEvents);
      else if (res.status === 404 || res.reason === "no key") break;
    }
    if (!parsed) log_("info", "capture", "AI result unusable after retry, fallback used");
  }
  if (!parsed) parsed = captureFallback(text, now);
  if (!allowEvents) parsed = parsed.slice(0, 1); // quickAdd returns a single to-do
  // D27: to-dos without a category get a subject from its keywords (also without AI).
  var matchers = subjectMatchers_(config);
  parsed.forEach(function (r) {
    if (r.type === "todo" && !r.fields.category) {
      var subject = matchSubject(r.fields.title, matchers);
      if (subject) r.fields.category = subject;
    }
  });

  var todoCount = parsed.filter(function (r) {
    return r.type === "todo";
  }).length;
  var ids = captureTodoIds(p.id, todoCount) || parsed.map(function () {
    return Utilities.getUuid();
  });

  if (p.dryRun) {
    var n = 0;
    return captureResponse(parsed.map(function (r) {
      if (r.type === "event") return { type: "event", event: previewCalEvent(r.event) };
      return { type: "todo", todo: newTodo(Object.assign({ id: ids[n++] }, r.fields), nowIso_(), "quick") };
    }), true);
  }

  return withWriteLock_(function () {
    var again = cacheKey && allowEvents && cache.get(cacheKey);
    if (again) return JSON.parse(again);
    // To-dos first (idempotent by id), then events: a failed event leaves nothing to duplicate on retry.
    var n = 0;
    var todos = parsed.map(function (r) {
      if (r.type !== "todo") return null;
      var id = ids[n++];
      var prev = loadTodoRecord_(id);
      return prev ? prev.todo : saveTodo_(newTodo(Object.assign({ id: id }, r.fields), nowIso_(), "quick"), "", 0);
    });
    var items = parsed.map(function (r, i) {
      if (r.type === "todo") return { type: "todo", todo: todos[i] };
      return { type: "event", event: createCaptureEvent_(r.event, config) };
    });
    var out = captureResponse(items);
    if (cacheKey && allowEvents) cache.put(cacheKey, JSON.stringify(out), 21600);
    return out;
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
  var todo = todoFromMail(rec, Utilities.getUuid(), nowIso_(), "", subjectMatchers_());
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
  // D24: the inbox follows the verdict (only in mode "active" with archiving on).
  if (config.mode === "active" && toBool(config.archiveAfterLabel)) {
    if (verdict === "wichtig") setInbox_(mailId, true);
    else if (!rec.sensitive && !rec.todoId) setInbox_(mailId, false);
  }
  return { ruleAdded: fr.matchIndex < 0 };
}
