/** Notifications (pure): ntfy message, quiet hours, reminders, briefing text, failure alerts. */

var NTFY_MAX_BYTES = 4096;
var NOTIFY_MAX_ATTEMPTS = 3;
var NOTIFY_QUEUE_MAX = 30;
var FAILURE_ALERT_AFTER = 3;
var FAILURE_ALERT_INTERVAL_MS = 6 * 3600 * 1000;

function utf8Length(s) {
  var n = 0;
  for (var i = 0; i < s.length; i++) {
    var c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff) {
      n += 4;
      i++;
    } else n += 3;
  }
  return n;
}

/** Cuts s so its UTF-8 encoding fits into maxBytes (never splits a surrogate pair). */
function truncateUtf8(s, maxBytes) {
  if (utf8Length(s) <= maxBytes) return s;
  var out = "";
  var bytes = 0;
  var limit = maxBytes - 3; // room for "…"
  for (var i = 0; i < s.length; i++) {
    var c = s.charCodeAt(i);
    var ch = s[i];
    var b = c < 0x80 ? 1 : c < 0x800 ? 2 : 3;
    if (c >= 0xd800 && c <= 0xdbff) {
      ch = s.slice(i, i + 2);
      b = 4;
    }
    if (bytes + b > limit) break;
    out += ch;
    bytes += b;
    if (b === 4) i++;
  }
  return out + "…";
}

/**
 * Channel-independent message -> ntfy JSON body (published to the server root URL).
 * msg: {title, body, priority (1-5), clickUrl?, tag?}
 */
function ntfyBody(msg, topic) {
  var p = Math.round(Number(msg.priority) || 3);
  var body = {
    topic: topic,
    title: truncateUtf8(cleanLine(msg.title || "Cockpit", 0), 250),
    message: truncateUtf8(String(msg.body || "").trim() || " ", NTFY_MAX_BYTES),
    priority: Math.min(5, Math.max(1, p)),
  };
  if (msg.clickUrl && /^https:\/\//.test(msg.clickUrl)) body.click = msg.clickUrl;
  if (msg.tag) body.tags = [String(msg.tag)];
  return body;
}

/** True when the Zurich wall time of `now` lies in [quietFrom, quietTo) (may cross midnight). */
function isQuietTime(now, quietFrom, quietTo) {
  var from = parseHhmm(quietFrom);
  var to = parseHhmm(quietTo);
  if (from === null || to === null || from === to) return false;
  var m = zurichMinuteOfDay(now);
  return from < to ? m >= from && m < to : m >= from || m < to;
}

/** Next instant (after now) at which the quiet period ends. */
function quietEndAfter(now, quietTo) {
  var to = parseHhmm(quietTo);
  if (to === null) return now;
  var today = toZurichDate(now);
  var candidate = zurichInstant(today, to);
  if (candidate.getTime() <= now.getTime()) candidate = zurichInstant(addDaysIso(today, 1), to);
  return candidate;
}

/**
 * Earliest delivery time for a message: deferred to quietTo during quiet hours unless the
 * message ignores quiet hours (explicit reminders, briefing).
 */
function deliverAfter(now, config, ignoreQuiet) {
  if (ignoreQuiet || !isQuietTime(now, config.quietFrom, config.quietTo)) return now;
  return quietEndAfter(now, config.quietTo);
}

/** Queue entry for a message. */
function queueItem(msg, notBefore, key) {
  return {
    key: key || "",
    msg: { title: msg.title, body: msg.body, priority: msg.priority, clickUrl: msg.clickUrl || "", tag: msg.tag || "" },
    notBefore: notBefore.getTime(),
    attempts: 0,
  };
}

/** Adds items to the queue, skipping keys already queued; oldest items drop first when full. */
function enqueue(queue, items) {
  var q = (queue || []).slice();
  items.forEach(function (it) {
    if (it.key && q.some(function (x) {
      return x.key === it.key;
    })) return;
    q.push(it);
  });
  return q.length > NOTIFY_QUEUE_MAX ? q.slice(q.length - NOTIFY_QUEUE_MAX) : q;
}

/** Splits the queue into items due now and the rest. */
function dueQueueItems(queue, now) {
  var due = [];
  var rest = [];
  (queue || []).forEach(function (it) {
    (it.notBefore <= now.getTime() ? due : rest).push(it);
  });
  return { due: due, rest: rest };
}

/**
 * Result of a send attempt -> {keep: item|null, failed: bool}. Temporary errors keep the item for
 * the next tick until NOTIFY_MAX_ATTEMPTS is reached.
 */
function afterSendAttempt(item, ok) {
  if (ok) return { keep: null, dropped: false };
  var next = Object.assign({}, item, { attempts: (item.attempts || 0) + 1 });
  if (next.attempts >= NOTIFY_MAX_ATTEMPTS) return { keep: null, dropped: true };
  return { keep: next, dropped: false };
}

// --- Reminders --------------------------------------------------------------

var REMINDER_DEFAULT_LEAD_MIN = 60;
var REMINDER_MAX_LATE_MS = 6 * 3600 * 1000;

/** Instant a reminder is due for a todo, or null (remindAt, else 60 min before a timed due). */
function reminderTime(todo) {
  if (todo.remindAt && isIsoDateTime(todo.remindAt)) return new Date(Date.parse(todo.remindAt));
  if (todo.due && todo.dueHasTime && isIsoDateTime(todo.due)) {
    return new Date(Date.parse(todo.due) - REMINDER_DEFAULT_LEAD_MIN * MS_PER_MIN);
  }
  return null;
}

/**
 * records: [{todo, remindedAt}] -> [{id, send: bool, msg?}] for open todos whose reminder is due
 * and not yet sent. Reminders more than 6 h late are only marked, not sent.
 */
function dueReminders(records, now) {
  var out = [];
  records.forEach(function (r) {
    var t = r.todo;
    if (t.status !== "open" || r.remindedAt) return;
    var at = reminderTime(t);
    if (!at || at.getTime() > now.getTime()) return;
    if (now.getTime() - at.getTime() > REMINDER_MAX_LATE_MS) {
      out.push({ id: t.id, send: false });
      return;
    }
    out.push({ id: t.id, send: true, msg: reminderMessage(t) });
  });
  return out;
}

function hhmmOf_(iso) {
  return toZurichIso(new Date(Date.parse(iso))).slice(11, 16);
}

function reminderMessage(todo) {
  var body = "Erinnerung";
  if (todo.due) {
    var dueDate = todo.dueHasTime ? toZurichDate(new Date(Date.parse(todo.due))) : todo.due;
    body = "Fällig " + formatDateCh(dueDate) + (todo.dueHasTime ? " um " + hhmmOf_(todo.due) : "");
  }
  return { title: todo.title, body: body, priority: 4, clickUrl: "", tag: "todo" };
}

// --- Briefing ---------------------------------------------------------------

/** Briefing time "HH:MM" for a date (weekend = Saturday/Sunday). */
function briefingTimeFor(isoDate, config) {
  var wd = weekdayOfIso(isoDate);
  return wd === 0 || wd === 6 ? config.briefingWeekend : config.briefingWeekday;
}

/** Whether the briefing should be generated now. sentDate = date of the last sent briefing. */
function briefingDue(now, config, sentDate) {
  var today = toZurichDate(now);
  if (sentDate === today) return false;
  var at = parseHhmm(briefingTimeFor(today, config));
  if (at === null) return false;
  return zurichMinuteOfDay(now) >= at;
}

function plural_(n, one, many) {
  return n + " " + (n === 1 ? one : many);
}

/**
 * Template briefing (no AI). input: {now, events, todos, exams, mails} in State shapes.
 * Mentions: first lecture with room, number of events, todos due today and overdue,
 * exams in the next 14 days, important mails since yesterday.
 */
function buildBriefingText(input) {
  var now = input.now;
  var today = toZurichDate(now);
  var lines = [];

  var todays = (input.events || []).filter(function (e) {
    if (e.allDay) return e.start <= today && e.end > today;
    return toZurichDate(new Date(Date.parse(e.start))) === today;
  });
  var lectures = todays
    .filter(function (e) {
      return e.kind === "lecture" && !e.allDay;
    })
    .sort(function (a, b) {
      return Date.parse(a.start) - Date.parse(b.start);
    });
  var termine = plural_(todays.length, "Termin", "Termine");
  if (lectures.length) {
    var first = lectures[0];
    lines.push(
      "Heute " + termine + ". Erste Lektion " + hhmmOf_(first.start) + " " + first.title +
        (first.location ? " (" + first.location + ")" : "") + "."
    );
  } else {
    lines.push(todays.length ? "Heute " + termine + ", keine Lektionen." : "Heute keine Termine.");
  }

  var open = (input.todos || []).filter(function (t) {
    return t.status === "open" && t.due;
  });
  var dueToday = 0;
  var overdue = 0;
  open.forEach(function (t) {
    var day = t.dueHasTime ? toZurichDate(new Date(Date.parse(t.due))) : String(t.due).slice(0, 10);
    if (day < today) overdue++;
    else if (day === today) dueToday++;
  });
  if (dueToday || overdue) {
    var parts = [];
    if (dueToday) parts.push(dueToday + " heute fällig");
    if (overdue) parts.push(overdue + " überfällig");
    lines.push("To-dos: " + parts.join(", ") + ".");
  } else {
    lines.push("Keine To-dos fällig.");
  }

  var horizon = addDaysIso(today, 14);
  var exams = (input.exams || [])
    .filter(function (e) {
      var d = String(e.start).slice(0, 10);
      return d >= today && d <= horizon;
    })
    .sort(function (a, b) {
      return String(a.start) < String(b.start) ? -1 : 1;
    });
  if (exams.length) {
    lines.push(
      "Prüfungen/Abgaben: " +
        exams
          .slice(0, 3)
          .map(function (e) {
            var d = String(e.start).slice(0, 10);
            var days = Math.round((Date.parse(d) - Date.parse(today)) / MS_PER_DAY);
            var when = days === 0 ? "heute" : days === 1 ? "morgen" : "in " + days + " Tagen";
            return e.title + " " + when;
          })
          .join(", ") +
        (exams.length > 3 ? " und " + (exams.length - 3) + " weitere" : "") +
        "."
    );
  }

  var since = zurichMidnight(addDaysIso(today, -1)).getTime();
  var important = (input.mails || []).filter(function (m) {
    return m.importance >= 2 && Date.parse(m.receivedAt) >= since;
  }).length;
  if (important) lines.push(plural_(important, "wichtige Mail", "wichtige Mails") + " seit gestern.");

  return lines.join("\n");
}

function briefingTitle(isoDate) {
  var days = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
  var p = isoDate.split("-");
  return "Briefing " + days[weekdayOfIso(isoDate)] + ", " + +p[2] + "." + +p[1] + ".";
}

// --- Backend failure alert ----------------------------------------------------

/**
 * Tracks consecutive failed ticks. Returns {fails, alert} where alert is true when an alert
 * should be sent now (3 failures in a row, at most once per 6 h).
 */
function failureTracking(prevFails, tickOk, lastAlertMs, nowMs) {
  if (tickOk) return { fails: 0, alert: false };
  var fails = (prevFails || 0) + 1;
  var alert = fails >= FAILURE_ALERT_AFTER && (!lastAlertMs || nowMs - lastAlertMs >= FAILURE_ALERT_INTERVAL_MS);
  return { fails: fails, alert: alert };
}

// --- Channels -----------------------------------------------------------------

var TELEGRAM_MAX_CHARS = 4096;

/**
 * config.pushChannels -> channel names to use. "auto" (default) = telegram when configured,
 * otherwise ntfy. A comma list ("telegram,ntfy") uses every listed channel that is configured.
 */
function activeChannelNames(setting, channels) {
  var configured = channels.filter(function (c) {
    return c.configured;
  }).map(function (c) {
    return c.name;
  });
  var s = String(setting || "auto").trim().toLowerCase();
  if (s === "" || s === "auto") {
    return configured.indexOf("telegram") >= 0 ? ["telegram"] : configured.indexOf("ntfy") >= 0 ? ["ntfy"] : [];
  }
  return s.split(/[,\s]+/).filter(function (n) {
    return configured.indexOf(n) >= 0;
  });
}

/** Telegram sendMessage body: plain text (no parse_mode, so mail text cannot inject markup). */
function telegramBody(msg, chatId) {
  var p = Math.round(Number(msg.priority) || 3);
  var head = (p >= 4 ? "❗ " : "") + cleanLine(msg.title || "Cockpit", 250);
  var parts = [head, String(msg.body || "").trim()];
  if (msg.clickUrl && /^https:\/\//.test(msg.clickUrl)) parts.push(msg.clickUrl);
  var text = parts.filter(Boolean).join("\n");
  if (text.length > TELEGRAM_MAX_CHARS) text = text.slice(0, TELEGRAM_MAX_CHARS - 1) + "…";
  return {
    chat_id: String(chatId),
    text: text,
    link_preview_options: { is_disabled: true },
    disable_notification: p <= 2,
  };
}

/** Chat id of the most recent private chat in a getUpdates response, or null. */
function latestPrivateChatId(resp) {
  var list = resp && Array.isArray(resp.result) ? resp.result : [];
  for (var i = list.length - 1; i >= 0; i--) {
    var m = list[i].message || list[i].edited_message;
    if (m && m.chat && m.chat.type === "private" && m.chat.id) return m.chat.id;
  }
  return null;
}
