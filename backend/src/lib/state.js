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
  // Mail categories (= Gmail labels) as JSON lists; personal values come from private.local.js.
  mailCategories: '["Wichtig", "Info"]',
  sensitiveCategories: "[]",
  junkCategory: "Unwichtig",
  // auto = Telegram when configured, else ntfy; or a list such as "telegram,ntfy" (D19)
  pushChannels: "auto",
  setupCode: "",
};

// aiAttempts (not in SPEC §2.2) counts failed AI attempts for the retry limit of 3.
var MAIL_COLUMNS = [
  "id", "threadId", "receivedAt", "fromName", "fromEmail", "subject", "category", "importance",
  "summary", "actionRequired", "deadline", "consequence", "sensitive", "classifiedBy", "todoId",
  "dismissed", "notifiedAt", "aiAttempts",
];

var SETTINGS_LIMITS = { stop: 100, categories: 30, label: 40 };

/** Validates a `settings.update` payload (all fields optional, at least one). */
function validateSettingsUpdate(p) {
  if (!isPlainObject(p)) return fail_("payload must be an object");
  var allowed = ["homeStop", "campusStop", "lat", "lon", "categories"];
  var keys = Object.keys(p);
  if (!keys.length) return fail_("payload is empty");
  for (var i = 0; i < keys.length; i++) {
    if (allowed.indexOf(keys[i]) < 0) return fail_("field not allowed: " + keys[i]);
  }
  var stops = ["homeStop", "campusStop"];
  for (var j = 0; j < stops.length; j++) {
    var v = p[stops[j]];
    if (v !== undefined && (typeof v !== "string" || v.length > SETTINGS_LIMITS.stop)) {
      return fail_(stops[j] + " must be a string of at most 100 characters");
    }
  }
  function coord(x, max) {
    return typeof x === "number" && isFinite(x) && x >= -max && x <= max;
  }
  if (p.lat !== undefined && !coord(p.lat, 90)) return fail_("lat is invalid");
  if (p.lon !== undefined && !coord(p.lon, 180)) return fail_("lon is invalid");
  if (p.categories !== undefined) {
    if (!Array.isArray(p.categories) || p.categories.length > SETTINGS_LIMITS.categories) {
      return fail_("categories must be an array of at most 30");
    }
    var ids = {};
    for (var k = 0; k < p.categories.length; k++) {
      var c = p.categories[k];
      if (!isPlainObject(c) || typeof c.id !== "string" || !ID_PATTERN.test(c.id) || ids[c.id]) {
        return fail_("category id is invalid or duplicate");
      }
      ids[c.id] = true;
      if (typeof c.label !== "string" || c.label.trim() === "" || c.label.length > SETTINGS_LIMITS.label) {
        return fail_("category label is invalid");
      }
      if (typeof c.color !== "string" || !/^#[0-9A-Fa-f]{6}$/.test(c.color)) return fail_("category color must be #RRGGBB");
      if (c.group !== "schule" && c.group !== "privat") return fail_("category group is invalid");
    }
  }
  return { ok: true, value: p };
}

/** Validated settings patch -> [[configKey, value], ...]. */
function settingsToConfigPairs(p) {
  var out = [];
  if (p.homeStop !== undefined) out.push(["homeStop", p.homeStop.trim()]);
  if (p.campusStop !== undefined) out.push(["campusStop", p.campusStop.trim()]);
  if (p.lat !== undefined) out.push(["lat", String(p.lat)]);
  if (p.lon !== undefined) out.push(["lon", String(p.lon)]);
  if (p.categories !== undefined) {
    var cats = p.categories.map(function (c) {
      return { id: c.id, label: c.label.trim(), color: c.color, group: c.group };
    });
    out.push(["categories", JSON.stringify(cats)]);
  }
  return out;
}

/** [[key, value], ...] -> object with defaults applied. Empty cells keep the default. */
function parseConfigRows(rows) {
  var c = Object.assign({}, CONFIG_DEFAULTS);
  (rows || []).forEach(function (r) {
    var k = String(r[0] || "").trim();
    if (k && r[1] !== "" && r[1] != null) c[k] = configCellString_(r[1]);
  });
  return c;
}

/**
 * Cell value -> string. Sheets turns a typed "6:30" into a time value (a Date on 30.12.1899);
 * its wall-clock time in the script time zone is the intended "HH:MM". Booleans become "true"/"false".
 */
function configCellString_(v) {
  if (v && typeof v === "object" && typeof v.getHours === "function") {
    if (v.getFullYear() < 1901) return pad2_(v.getHours()) + ":" + pad2_(v.getMinutes());
    return toZurichIso(v);
  }
  if (typeof v === "boolean") return v ? "true" : "false";
  var s = String(v).trim();
  if (/^(true|false)$/i.test(s)) return s.toLowerCase();
  return /^\d:\d{2}$/.test(s) ? "0" + s : s;
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
