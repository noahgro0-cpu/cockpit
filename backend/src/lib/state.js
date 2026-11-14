/** Config parsing and State/WidgetState assembly (pure). */

var CONFIG_DEFAULTS = {
  mode: "observe",
  archiveAfterLabel: "false",
  quietFrom: "22:00",
  quietTo: "06:30",
  briefingWeekday: "06:30",
  briefingWeekend: "09:00",
  homeStop: "",
  campusStop: "",
  lat: "",
  lon: "",
  aiEnabled: "true",
  aiModel: "gemini-3.5-flash-lite",
  mailRetentionDays: "30",
  calLectures: "",
  calExams: "Prüfungen",
  categories: "[]",
  setupCode: "",
};

var MAIL_COLUMNS = [
  "id", "threadId", "receivedAt", "fromName", "fromEmail", "subject", "category", "importance",
  "summary", "actionRequired", "deadline", "consequence", "sensitive", "classifiedBy", "todoId",
  "dismissed", "notifiedAt",
];

/** [[key, value], ...] -> object with defaults applied. Empty cells keep the default. */
function parseConfigRows(rows) {
  var c = Object.assign({}, CONFIG_DEFAULTS);
  (rows || []).forEach(function (r) {
    var k = String(r[0] || "").trim();
    if (k && r[1] !== "" && r[1] != null) c[k] = String(r[1]);
  });
  return c;
}

function parseCategories(json) {
  var list;
  try {
    list = JSON.parse(json || "[]");
  } catch (e) {
    return [];
  }
  if (!Array.isArray(list)) return [];
  return list
    .filter(function (c) {
      return c && typeof c.id === "string" && typeof c.label === "string";
    })
    .map(function (c) {
      return {
        id: c.id,
        label: c.label,
        color: typeof c.color === "string" ? c.color : "#D9DDE3",
        group: c.group === "schule" ? "schule" : "privat",
      };
    });
}

function settingsFromConfig(c) {
  return {
    categories: parseCategories(c.categories),
    homeStop: c.homeStop,
    campusStop: c.campusStop,
    lat: Number(c.lat) || 0,
    lon: Number(c.lon) || 0,
  };
}

/** Calendar name + event title -> CalEvent kind. */
function eventKind(calendarName, config, tagKind, title) {
  if (config.calLectures && calendarName === config.calLectures) return "lecture";
  if (config.calExams && calendarName === config.calExams) {
    if (tagKind === "exam" || tagKind === "deadline") return tagKind;
    return /abgabe|deadline|einreich|frist/i.test(title || "") ? "deadline" : "exam";
  }
  return "private";
}

/** Start instant of a CalEvent for sorting (all-day = Zurich midnight). */
function eventStartMs(e) {
  return e.allDay ? zurichMidnight(e.start).getTime() : Date.parse(e.start);
}

function sortEvents(events) {
  return events.slice().sort(function (a, b) {
    return eventStartMs(a) - eventStartMs(b) || (a.title < b.title ? -1 : a.title > b.title ? 1 : 0);
  });
}

/** Todo sort: open before done, then by due (none last), priority desc, createdAt. */
function compareTodos(a, b) {
  if (a.status !== b.status) return a.status === "open" ? -1 : 1;
  var da = a.due ? dueInstant(a.due).getTime() : Infinity;
  var db = b.due ? dueInstant(b.due).getTime() : Infinity;
  if (da !== db) return da < db ? -1 : 1;
  if (a.priority !== b.priority) return b.priority - a.priority;
  return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
}

/** All open todos plus todos done within the last 7 days. */
function selectTodos(todos, now) {
  var cutoff = now.getTime() - 7 * MS_PER_DAY;
  return todos
    .filter(function (t) {
      if (t.status === "open") return true;
      return t.doneAt ? Date.parse(t.doneAt) >= cutoff : false;
    })
    .sort(compareTodos);
}

function rowToMail(row) {
  var r = {};
  for (var i = 0; i < MAIL_COLUMNS.length; i++) r[MAIL_COLUMNS[i]] = row[i];
  var imp = Number(r.importance);
  var m = {
    id: String(r.id),
    threadId: String(r.threadId),
    receivedAt: normalizeDateCell(r.receivedAt, false),
    fromName: String(r.fromName || ""),
    fromEmail: String(r.fromEmail || ""),
    subject: String(r.subject || ""),
    category: String(r.category || ""),
    importance: imp === 1 || imp === 2 || imp === 3 ? imp : 0,
    summary: String(r.summary || ""),
    actionRequired: toBool(r.actionRequired),
    sensitive: toBool(r.sensitive),
    classifiedBy: r.classifiedBy === "rule" || r.classifiedBy === "ai" ? r.classifiedBy : "none",
  };
  var deadline = normalizeDateCell(r.deadline, true);
  if (deadline) m.deadline = deadline;
  if (r.consequence) m.consequence = String(r.consequence);
  if (r.todoId) m.todoId = String(r.todoId);
  return { mail: m, dismissed: toBool(r.dismissed) };
}

/** Last 14 days, importance >= 1, not dismissed, newest first, at most 50. */
function selectMails(entries, now) {
  var cutoff = now.getTime() - 14 * MS_PER_DAY;
  return entries
    .filter(function (e) {
      return !e.dismissed && e.mail.importance >= 1 && Date.parse(e.mail.receivedAt) >= cutoff;
    })
    .map(function (e) {
      return e.mail;
    })
    .sort(function (a, b) {
      return Date.parse(b.receivedAt) - Date.parse(a.receivedAt);
    })
    .slice(0, 50);
}

function buildState(input) {
  return {
    schema: 1,
    generatedAt: toZurichIso(input.now),
    health: input.health,
    events: sortEvents(input.events),
    exams: sortEvents(input.exams),
    todos: selectTodos(input.todos, input.now),
    mails: selectMails(input.mails, input.now),
    briefing: input.briefing || null,
    settings: input.settings,
  };
}

/** Compact widget state derived from a full State. */
function buildWidget(state, now) {
  var nowMs = now.getTime();
  var today = toZurichDate(now);
  var timed = state.events.filter(function (e) {
    return !e.allDay && Date.parse(e.end) > nowMs;
  });
  var todayEvents = state.events.filter(function (e) {
    if (e.allDay) return e.start <= today && e.end > today;
    return toZurichDate(new Date(Date.parse(e.start))) === today;
  });
  var openTodos = state.todos.filter(function (t) {
    return t.status === "open";
  });
  var mails = state.mails.slice().sort(function (a, b) {
    return b.importance - a.importance || Date.parse(b.receivedAt) - Date.parse(a.receivedAt);
  });
  return {
    schema: 1,
    generatedAt: state.generatedAt,
    health: state.health,
    nextEvent: timed.length ? timed[0] : null,
    today: todayEvents,
    todos: openTodos.slice(0, 5),
    mails: mails.slice(0, 3),
  };
}

/** Number of log rows that are errors within the last 24 h. Rows: [ts, level, area, message]. */
function countRecentErrors(logRows, now) {
  var cutoff = now.getTime() - MS_PER_DAY;
  return logRows.filter(function (r) {
    var ts = normalizeDateCell(r[0], false);
    return r[1] === "error" && Date.parse(ts) >= cutoff;
  }).length;
}
