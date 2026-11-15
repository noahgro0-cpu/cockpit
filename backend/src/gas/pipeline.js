/** Mail pipeline (SPEC §2.6), reminders, briefing and housekeeping, called from tick(). */

var MAILS_PER_TICK = 25;
var PUSH_MAX_AGE_MS = 24 * 3600 * 1000; // never push for old mail (e.g. the first sync looks 3 days back)
var SKIP_CACHE_PREFIX = "skipMail:";

function loadRules_() {
  var raw = readRowsRaw_("regeln");
  var parsed = parseRules(raw.rows, raw.rowNums);
  if (parsed.errors.length) {
    var cache = CacheService.getScriptCache();
    var sig = parsed.errors.join("|").slice(0, 200);
    if (cache.get("ruleErrors") !== sig) {
      log_("warn", "rules", parsed.errors.join("; "));
      cache.put("ruleErrors", sig, 21600);
    }
  }
  return parsed.rules;
}

/**
 * Runs one pipeline pass. deadlineMs = hard time budget (epoch ms).
 * Returns {fresh, retried, ai} counts for the log.
 */
function runMailPipeline_(deadlineMs) {
  var started = new Date();
  var config = readConfig_();
  var mcfg = mailConfig(config);
  var rules = loadRules_();
  var useAi = aiAvailable_(config) && mcfg.categories.length > 0;
  var p = props_();
  var cache = CacheService.getScriptCache();

  // 1. Search + duplicate protection via the Gmail message id.
  var index = readMailIndex_();
  var ids = gmailListIds_(mailSearchQuery(p.getProperty("LAST_MAIL_SYNC"), started), 500);
  var skipped = ids.length
    ? cache.getAll(ids.map(function (id) {
        return SKIP_CACHE_PREFIX + id;
      }))
    : {};
  var fresh = ids.filter(function (id) {
    return !index.byId[id] && !skipped[SKIP_CACHE_PREFIX + id];
  }).reverse(); // oldest first
  var backlog = fresh.length > MAILS_PER_TICK;
  fresh = fresh.slice(0, MAILS_PER_TICK);
  var retry = useAi
    ? index.list.filter(function (e) {
        return needsAiRetry(e) && !e.dismissed && started.getTime() - Date.parse(e.receivedAt) < 14 * MS_PER_DAY;
      }).slice(0, Math.max(0, MAILS_PER_TICK - fresh.length))
    : [];

  if (!fresh.length && !retry.length) {
    if (!backlog) p.setProperty("LAST_MAIL_SYNC", toZurichIso(started));
    return { fresh: 0, retried: 0, ai: 0 };
  }

  var labelNames = gmailLabelNames_();
  var items = []; // {mail, local, prev (stored entry for retries), ref}
  fresh.forEach(function (id) {
    var msg = gmailGet_(id);
    if (!msg) return;
    if (isOwnOutgoing(msg.labelIds)) {
      cache.put(SKIP_CACHE_PREFIX + id, "1", 21600);
      return;
    }
    items.push({ mail: parseGmailMessage(msg, labelNames, decodeGmailData_), prev: null });
  });
  retry.forEach(function (e) {
    var msg = gmailGet_(e.id);
    if (!msg) return;
    items.push({ mail: parseGmailMessage(msg, labelNames, decodeGmailData_), prev: e });
  });

  // 2. Rules (and the user's own Gmail labels). Sensitive or fixed-importance mails stop here.
  items.forEach(function (it, i) {
    it.local = classifyLocal(it.mail, rules, mcfg, useAi);
    it.ref = "m" + (i + 1);
    if (it.local.sensitive) {
      log_("info", "mail", "mail " + it.mail.id + ": sensitive" +
        (it.local.rule ? " (rule row " + it.local.rule.row + ")" : " (label)") + " - not sent to AI");
    }
  });

  // 3./4. AI in batches of at most 8, output validated against the schema.
  var aiResults = {};
  var aiFailed = {};
  var today = toZurichDate(started);
  var toAi = items.filter(function (it) {
    return it.local.toAi;
  });
  var stop = false;
  chunk(toAi, AI_BATCH_SIZE).forEach(function (batch) {
    var refs = batch.map(function (it) {
      return it.ref;
    });
    if (stop || Date.now() > deadlineMs - 30000) {
      refs.forEach(function (r) {
        aiFailed[r] = true;
      });
      return;
    }
    var body = buildMailAiRequest(batch.map(function (it) {
      return Object.assign({ ref: it.ref }, it.mail);
    }), mcfg.categories, today);
    var res = callGemini_(body, config);
    if (!res.ok) {
      if (res.status === 429 || res.status === 404) stop = true;
      refs.forEach(function (r) {
        aiFailed[r] = true;
      });
      return;
    }
    var parsed = parseMailAiBatch(res.text, refs, mcfg.categories, today);
    var valid = 0;
    refs.forEach(function (r) {
      if (parsed[r]) {
        aiResults[r] = parsed[r];
        valid++;
      } else aiFailed[r] = true;
    });
    log_("info", "ai", "AI batch: " + refs.length + " mails sent (" + batch.map(function (it) {
      return it.mail.id;
    }).join(",") + "), " + valid + " valid");
  });

  var entries = items.map(function (it) {
    var state = aiResults[it.ref] ? "ok" : aiFailed[it.ref] ? "failed" : "skipped";
    var e = finalizeMail(it.mail, it.local, aiResults[it.ref] || null, state, it.prev ? it.prev.aiAttempts : 0, mcfg);
    e.isRetry = !!it.prev;
    if (it.prev) {
      e.todoId = it.prev.todoId;
      e.dismissed = it.prev.dismissed;
      e.notifiedAt = normalizeDateCell(it.prev.notifiedAt, false);
    }
    return e;
  });

  // 5./8. To-dos and storage, under the write lock (re-read to avoid clobbering API writes).
  var nowIso = toZurichIso(new Date());
  withWriteLock_(function () {
    var idx = readMailIndex_();
    var threadTodo = {};
    idx.list.forEach(function (m) {
      if (m.todoId) threadTodo[m.threadId] = m.todoId;
    });
    var newRows = [];
    var newTodos = [];
    entries.forEach(function (e) {
      var stored = idx.byId[e.id];
      if (!e.isRetry && stored) {
        e.skip = true; // processed concurrently
        return;
      }
      if (e.isRetry && !stored) {
        e.skip = true; // deleted meanwhile
        return;
      }
      if (e.isRetry) e.todoId = stored.todoId;
      if (wantsAutoTodo(e) && !e.todoId) {
        if (threadTodo[e.threadId]) {
          e.todoId = threadTodo[e.threadId]; // at most one to-do per thread
        } else {
          var todo = todoFromMail(e, Utilities.getUuid(), nowIso, e.todoTitle);
          newTodos.push(todoToRow(todo, ""));
          e.todoId = todo.id;
          threadTodo[e.threadId] = todo.id;
        }
      }
      if (e.isRetry) {
        setCells_("mails", stored.rowNum, {
          category: e.category, importance: e.importance, summary: e.summary, actionRequired: e.actionRequired,
          deadline: e.deadline, consequence: e.consequence, sensitive: e.sensitive, classifiedBy: e.classifiedBy,
          todoId: e.todoId, aiAttempts: e.aiAttempts,
        });
      } else {
        newRows.push(mailToRow(e));
      }
    });
    appendRows_("todos", newTodos);
    appendRows_("mails", newRows);
    if (newTodos.length) log_("info", "mail", newTodos.length + " to-do(s) created from mail");
  });
  var stored = entries.filter(function (e) {
    return !e.skip;
  });

  // 6. Gmail labels: planLabelOps returns nothing unless mode = active.
  applyLabelOps_(planLabelOps(stored, config));

  // 7. Push (deferred during quiet hours by notify()).
  stored.forEach(function (e) {
    if (!wantsPush(e) || e.notifiedAt || e.dismissed) return;
    if (started.getTime() - Date.parse(e.receivedAt) > PUSH_MAX_AGE_MS) return;
    notify(mailNotification(e), { key: "mail:" + e.id, config: config });
  });

  if (!backlog) p.setProperty("LAST_MAIL_SYNC", toZurichIso(started));
  return { fresh: fresh.length, retried: retry.length, ai: Object.keys(aiResults).length };
}

/** Marks mails whose push was delivered. keys: delivered queue keys ("mail:<id>"). */
function markMailsNotified_(keys) {
  var ids = keys.filter(function (k) {
    return k && k.indexOf("mail:") === 0;
  }).map(function (k) {
    return k.slice(5);
  });
  if (!ids.length) return;
  withWriteLock_(function () {
    var idx = readMailIndex_();
    var ts = toZurichIso(new Date());
    ids.forEach(function (id) {
      if (idx.byId[id]) setCells_("mails", idx.byId[id].rowNum, { notifiedAt: ts });
    });
  });
}

/** To-do reminders: remindAt, else 60 min before a timed due date. */
function runReminders_() {
  var raw = readRowsRaw_("todos");
  var records = [];
  var rowById = {};
  raw.rows.forEach(function (r, i) {
    if (r[0] === "" || r[0] === null) return;
    var t = rowToTodo(r);
    records.push({ todo: t, remindedAt: normalizeDateCell(r[TODO_COLUMNS.indexOf("remindedAt")], false) });
    rowById[t.id] = raw.rowNums[i];
  });
  var due = dueReminders(records, new Date());
  if (!due.length) return 0;
  var config = readConfig_();
  due.forEach(function (d) {
    if (d.send) notify(d.msg, { key: "todo:" + d.id, ignoreQuiet: true, config: config });
  });
  withWriteLock_(function () {
    var ts = toZurichIso(new Date());
    due.forEach(function (d) {
      // The row may have moved if a to-do was deleted meanwhile: look it up again.
      var row = findRow_("todos", d.id);
      if (row) setCells_("todos", row, { remindedAt: ts });
    });
  });
  return due.length;
}

/** Morning briefing once per day, as soon as the briefing time is reached (DECISIONS.md D11). */
function runBriefing_() {
  var config = readConfig_();
  var now = new Date();
  var p = props_();
  if (!briefingDue(now, config, p.getProperty("BRIEFING_SENT"))) return false;
  var today = toZurichDate(now);
  var text = briefingTextNow_(now);
  p.setProperty("BRIEFING", JSON.stringify({ date: today, text: text }));
  p.setProperty("BRIEFING_SENT", today);
  var at = parseHhmm(briefingTimeFor(today, config));
  // If the backend was down for hours, keep the text for the app but do not push it late.
  if (zurichMinuteOfDay(now) - at <= 180) {
    notify({ title: briefingTitle(today), body: text, priority: 3, tag: "sunrise" }, { key: "briefing:" + today, ignoreQuiet: true, config: config });
  }
  return true;
}

/** Briefing text for `now` (calendar, to-dos, mails, weather); sends and stores nothing. */
function briefingTextNow_(now) {
  var config = readConfig_();
  var cal = readCalendarEvents_(config, now);
  return buildBriefingText({
    now: now,
    events: cal.events,
    exams: cal.exams,
    todos: readRows_("todos").map(rowToTodo),
    mails: selectMails(readRows_("mails").map(rowToMail), now),
    weatherText: weatherTextFor_(config, now, cal.events),
  });
}

/** Once per day: delete mail entries older than mailRetentionDays. */
function dailyCleanup_() {
  var p = props_();
  var today = toZurichDate(new Date());
  if (p.getProperty("CLEANUP_DATE") === today) return 0;
  var config = readConfig_();
  var removed = 0;
  withWriteLock_(function () {
    var idx = readMailIndex_();
    var expired = {};
    expiredMailIds(idx.list, new Date(), config.mailRetentionDays).forEach(function (id) {
      expired[id] = true;
    });
    var sh = sheet_("mails");
    idx.list
      .filter(function (m) {
        return expired[m.id];
      })
      .map(function (m) {
        return m.rowNum;
      })
      .sort(function (a, b) {
        return b - a;
      })
      .forEach(function (row) {
        sh.deleteRow(row);
        removed++;
      });
  });
  p.setProperty("CLEANUP_DATE", today);
  if (removed) log_("info", "cleanup", removed + " old mail entries removed");
  return removed;
}
