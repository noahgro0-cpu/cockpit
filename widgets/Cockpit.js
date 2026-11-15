// Paste these values in Scriptable on your device.
const SETUP_CODE = "";
const PWA_URL = "";

const TIME_ZONE = "Europe/Zurich";
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/;
const API_URL = /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/;
const WEB_URL = /^https:\/\/[\w.-]+(?:\/[^\s?#]*)?$/;
const WEEKDAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const REFRESH_MS = 15 * 60 * 1000;
const dayFormat = new Intl.DateTimeFormat("de-CH", {
  timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
});
const timeFormat = new Intl.DateTimeFormat("de-CH", {
  timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

function decodeSetup(code, decodeBase64) {
  const base64 = code.trim().replace(/-/g, "+").replace(/_/g, "/");
  const { u, k } = JSON.parse(decodeBase64(base64.padEnd(Math.ceil(base64.length / 4) * 4, "=")));
  if (typeof u !== "string" || !API_URL.test(u) || typeof k !== "string" || k.length < 32)
    throw new Error("Invalid setup code");
  return { url: u, key: k };
}

function day(value) {
  if (DATE_ONLY.test(value)) return value;
  const parts = Object.fromEntries(dayFormat.formatToParts(new Date(value)).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function clock(value) {
  return timeFormat.format(new Date(value));
}

function weekday(isoDay) {
  return new Date(`${isoDay}T00:00:00Z`).getUTCDay();
}

function addDays(isoDay, days) {
  const utc = new Date(`${isoDay}T00:00:00Z`);
  utc.setUTCDate(utc.getUTCDate() + days);
  return utc.toISOString().slice(0, 10);
}

function monday(isoDay) {
  return addDays(isoDay, -((weekday(isoDay) + 6) % 7));
}

function dateLabel(isoDay) {
  return `${WEEKDAYS[weekday(isoDay)]} ${isoDay.slice(8)}.${isoDay.slice(5, 7)}.`;
}

function singleLine(value, fallback = "") {
  return value?.replace(/\s+/g, " ").trim() || fallback;
}

function formatEvent(event, today, includeDate = false, firstDay = today) {
  const startDay = day(event.start);
  const shownDay = startDay < firstDay ? firstDay : startDay;
  const date = includeDate || shownDay !== today ? dateLabel(shownDay) : "";
  const time = event.allDay ? "Ganztägig" : shownDay !== startDay ? "Läuft" : clock(event.start);
  return {
    text: [date, time, singleLine(event.title, "Termin")].filter(Boolean).join(" · "),
  };
}

function formatTodo(todo, now, mode, compact = false) {
  const today = day(now);
  const dueDay = todo.due ? day(todo.due) : "";
  const timed = todo.due && todo.dueHasTime && !DATE_ONLY.test(todo.due);
  const overdue = dueDay && (dueDay < today || (timed && Date.parse(todo.due) <= +now));
  let when = "";
  if (dueDay && (!compact || mode === "woche")) {
    when = mode === "woche" || dueDay !== today ? dateLabel(dueDay) : "Heute";
    if (timed) when += ` ${clock(todo.due)}`;
  }
  return {
    text: [when, singleLine(todo.title, "To-do")].filter(Boolean).join(" · "),
    tone: overdue ? "danger" : "ink",
  };
}

function formatMail(mail) {
  return {
    text: singleLine(mail.subject, "Ohne Betreff"),
    detail: singleLine(mail.fromName) || singleLine(mail.fromEmail, "Unbekannter Absender"),
    tone: mail.importance === 3 ? "danger" : "ink",
  };
}

function validDate(value) {
  return typeof value === "string" && (DATE_ONLY.test(value) || DATE_TIME.test(value)) &&
    Number.isFinite(Date.parse(value));
}

function validEvent(event) {
  return event && typeof event.id === "string" && typeof event.title === "string" &&
    validDate(event.start) && validDate(event.end) && typeof event.allDay === "boolean" &&
    DATE_ONLY.test(event.start) === event.allDay && DATE_ONLY.test(event.end) === event.allDay;
}

function validTodo(todo) {
  return todo && typeof todo.title === "string" && ["open", "done"].includes(todo.status) &&
    Number.isInteger(todo.priority) && (todo.due === undefined || validDate(todo.due)) &&
    typeof todo.dueHasTime === "boolean";
}

function validMail(mail) {
  return mail && Number.isInteger(mail.importance) && validDate(mail.receivedAt) &&
    [mail.fromName, mail.fromEmail, mail.subject].every(value => typeof value === "string");
}

function validState(state) {
  return state?.schema === 1 && validDate(state.generatedAt) &&
    (state.nextEvent === null || validEvent(state.nextEvent)) &&
    Array.isArray(state.today) && state.today.every(validEvent) &&
    Array.isArray(state.todos) && state.todos.every(validTodo) &&
    Array.isArray(state.mails) && state.mails.every(validMail);
}

function selectTodos(todos) {
  return todos.filter(todo => todo.status === "open").sort((a, b) => {
    const aDay = a.due ? day(a.due) : "9999-12-31";
    const bDay = b.due ? day(b.due) : "9999-12-31";
    if (aDay !== bDay) return aDay.localeCompare(bDay);
    const aTime = a.dueHasTime && a.due ? Date.parse(a.due) : Infinity;
    const bTime = b.dueHasTime && b.due ? Date.parse(b.due) : Infinity;
    return aTime === bTime ? b.priority - a.priority : aTime < bTime ? -1 : 1;
  });
}

function selectMails(mails) {
  return mails.filter(mail => mail.importance >= 1)
    .sort((a, b) => b.importance - a.importance || Date.parse(b.receivedAt) - Date.parse(a.receivedAt));
}

function eventOrder(a, b) {
  return day(a.start).localeCompare(day(b.start)) ||
    Number(b.allDay) - Number(a.allDay) || Date.parse(a.start) - Date.parse(b.start);
}

function overlaps(event, firstDay, endDay) {
  // Subtract a millisecond for timed events ending exactly at midnight.
  const lastDay = event.allDay ? addDays(event.end, -1) : day(Date.parse(event.end) - 1);
  return day(event.start) < endDay && lastDay >= firstDay;
}

function selectCalendar(state, now) {
  const today = day(now);
  const firstDay = monday(today);
  const stateDay = day(state.generatedAt);
  const endDay = addDays(firstDay, 7);
  // The current API has today/nextEvent only. See OPEN-QUESTIONS.md for week.
  const week = monday(stateDay) === firstDay &&
    Array.isArray(state.week) && state.week.every(validEvent)
    ? state.week.filter(event => overlaps(event, firstDay, endDay)).sort(eventOrder)
    : null;
  const events = stateDay === today ? state.today : week;
  const agenda = events
    ? events.filter(event => overlaps(event, today, addDays(today, 1))).sort(eventOrder)
    : null;
  const next = [state.nextEvent, ...state.today, ...(week ?? [])]
    .filter(event => event && !event.allDay && Date.parse(event.end) > +now)
    .sort(eventOrder)[0] ?? null;
  return { week, agenda, next, firstDay };
}

function modeFor(family, parameter) {
  const mode = typeof parameter === "string" ? parameter.trim().toLowerCase() : "";
  return ["heute", "todos", "woche"].includes(mode) ? mode : family === "large" ? "woche" : "heute";
}

function section(title, rows, empty) {
  return { title, rows: rows.length ? rows : [{ text: empty, tone: "muted" }] };
}

function eventRows(events, limit, format) {
  const rows = events.slice(0, limit).map(format);
  if (events.length > limit) rows.push({ text: `+${events.length - limit} weitere`, tone: "muted" });
  return rows;
}

function widgetModel(state, family, parameter, now) {
  const today = day(now);
  const mode = modeFor(family, parameter);
  const todos = selectTodos(state.todos);
  const mails = selectMails(state.mails);
  const calendar = selectCalendar(state, now);
  const next = calendar.next
    ? formatEvent(calendar.next, today, mode === "woche")
    : { text: "Kein nächster Termin", tone: "muted" };
  const tasks = (limit, compact) => section("To-dos",
    todos.slice(0, limit).map(todo => formatTodo(todo, now, mode, compact)), "Keine offenen To-dos");
  const agenda = limit => section("Heute",
    eventRows(calendar.agenda ?? [], limit, event => formatEvent(event, today, mode === "woche")),
    calendar.agenda ? "Keine Termine" : "Agenda nicht geladen");

  if (family === "accessoryRectangular") {
    const task = todos[0] ? formatTodo(todos[0], now, mode, true)
      : { text: "Kein offenes To-do", tone: "muted" };
    const taskRow = { ...task, text: todos.length ? `To-do · ${task.text}` : task.text };
    return { sections: [{ rows: mode === "todos" ? [taskRow, next] : [next, taskRow] }] };
  }

  if (family === "small") {
    const sections = [];
    if (mails[0]) sections.push({ rows: [formatMail(mails[0])] });
    if (todos.length) {
      const todoSection = tasks(mails.length ? 2 : 3, true);
      if (mode === "todos") sections.unshift(todoSection);
      else sections.push(todoSection);
    }
    if (!sections.length) sections.push({ title: "Nächster Termin", rows: [next] });
    return { title: "Cockpit", sections };
  }

  if (family === "medium") {
    const sections = [agenda(3), tasks(3, false)];
    return { title: "Cockpit", sections: mode === "todos" ? sections.reverse() : sections };
  }

  const important = section("Wichtige Mails", mails.filter(mail => mail.importance >= 2).slice(0, 3)
    .map(formatMail), "Keine wichtigen Mails");
  const week = section("Diese Woche", calendar.week
    ? eventRows(calendar.week, mode === "woche" ? 7 : 4,
      event => formatEvent(event, today, true, calendar.firstDay))
    : [{ text: "Wochenagenda nicht verfügbar", tone: "muted" }], "Keine Termine");
  const sections = [week];
  if (!calendar.week && calendar.next && day(calendar.next.start) !== today)
    sections.push({ title: "Nächster Termin", rows: [next] });
  sections.push(important);
  if (mode === "todos") sections.unshift(tasks(3, false));
  if (mode === "heute" || !calendar.week) sections.splice(mode === "todos" ? 1 : 0, 0, agenda(3));
  return { title: "Cockpit", sections };
}

function cacheEntry(text, url) {
  const entry = JSON.parse(text);
  return entry?.url === url && validDate(entry.fetchedAt) && validState(entry.state) ? entry : null;
}

function cacheLabel(fetchedAt, now) {
  const recordedDay = day(fetchedAt);
  return `Stand ${clock(fetchedAt)}${recordedDay === day(now) ? "" : ` · ${dateLabel(recordedDay)}`}`;
}

async function loadState(connection) {
  let files, path;
  try {
    files = FileManager.local();
    path = files.joinPath(files.libraryDirectory(), "cockpit-widget-state.json");
  } catch {
    // Live data is still usable if storage is unavailable.
  }
  let message = "Verbindung prüfen";
  try {
    const request = new Request(connection.url);
    request.method = "POST";
    request.headers = { "Content-Type": "text/plain;charset=utf-8" };
    request.body = JSON.stringify({ key: connection.key, action: "getWidget", payload: {} });
    request.timeoutInterval = 8;
    const response = await request.loadJSON();
    if (response?.ok === true && validState(response.data)) {
      const entry = { url: connection.url, fetchedAt: new Date().toISOString(), state: response.data };
      try {
        if (path) files.writeString(path, JSON.stringify(entry));
      } catch {
        // Keep displaying the live result even if it cannot be saved.
      }
      return { state: entry.state };
    }
    message = response?.error?.code === "unauthorized" ? "Setup-Code prüfen" : "Cockpit nicht verfügbar";
  } catch {
    // A network failure or a non-JSON response can use the last good result.
  }
  try {
    const entry = path && files.fileExists(path) && cacheEntry(files.readString(path), connection.url);
    if (entry) return { state: entry.state, fetchedAt: entry.fetchedAt };
  } catch {
    // An unreadable cache is equivalent to a first run.
  }
  return { message };
}

function colors() {
  const dynamic = (light, dark) => Color.dynamic(new Color(light), new Color(dark));
  // Match the PWA tokens in web/src/tokens.css.
  return {
    background: dynamic("#f6f7f3", "#161e1a"),
    ink: dynamic("#26382f", "#edf2e9"),
    muted: dynamic("#58665e", "#b1beb3"),
    accent: dynamic("#375c48", "#b5d4b8"),
    danger: dynamic("#a1403b", "#ffb3a9"),
  };
}

function renderText(stack, text, font, color) {
  const label = stack.addText(text);
  label.font = font;
  if (color) label.textColor = color;
  label.lineLimit = 1;
  label.minimumScaleFactor = 0.85;
}

function renderSection(stack, section, palette, size, gap) {
  if (section.title) {
    renderText(stack, section.title, Font.semiboldSystemFont(11), palette.accent);
    stack.addSpacer(2);
  }
  for (const [index, row] of section.rows.entries()) {
    if (index > 0) stack.addSpacer(gap);
    if (row.detail) renderText(stack, row.detail, Font.systemFont(11), palette.muted);
    renderText(stack, row.text, Font.systemFont(size), palette[row.tone ?? "ink"]);
  }
}

function renderWidget(model, family, pwaUrl, now, status) {
  const widget = new ListWidget();
  widget.refreshAfterDate = new Date(+now + REFRESH_MS);
  if (pwaUrl) widget.url = pwaUrl;
  const lock = family === "accessoryRectangular";
  if (lock) {
    widget.setPadding(0, 0, 0, 0);
    // The Lock Screen supplies its own wallpaper-dependent tint.
    renderSection(widget, model.sections[0], {}, 12, 3);
    if (status) {
      widget.addSpacer(2);
      renderText(widget, status, Font.systemFont(10));
    }
    return widget;
  }

  const palette = colors();
  const small = family === "small";
  const padding = small ? 10 : 13;
  widget.backgroundColor = palette.background;
  widget.setPadding(padding, padding, padding, padding);
  renderText(widget, model.title, Font.semiboldSystemFont(14), palette.accent);
  widget.addSpacer(small ? 5 : 8);
  if (family === "medium" && model.sections.length === 2) {
    const columns = widget.addStack();
    columns.topAlignContent();
    const left = columns.addStack();
    left.layoutVertically();
    left.size = new Size(116, 0);
    renderSection(left, model.sections[0], palette, 12, 3);
    columns.addSpacer(12);
    const right = columns.addStack();
    right.layoutVertically();
    renderSection(right, model.sections[1], palette, 12, 3);
  } else {
    for (const [index, group] of model.sections.entries()) {
      if (index > 0) widget.addSpacer(small ? 5 : 8);
      renderSection(widget, group, palette, small ? 12 : 13, small ? 2 : 3);
    }
  }
  widget.addSpacer();
  if (status) renderText(widget, status, Font.systemFont(10), palette.muted);
  return widget;
}

async function buildWidget(family, parameter, setupCode, pwaAddress) {
  const pwaUrl = pwaAddress.trim();
  const validPwa = WEB_URL.test(pwaUrl);
  let result;
  if (!setupCode.trim()) result = { message: "Setup-Code einfügen" };
  else if (!validPwa) result = { message: "PWA-Adresse einfügen" };
  else {
    let connection;
    try {
      connection = decodeSetup(setupCode, base64 => Data.fromBase64String(base64)?.toRawString());
    } catch {
      result = { message: "Setup-Code prüfen" };
    }
    if (connection) result = await loadState(connection);
  }
  const now = new Date();
  const model = result.state ? widgetModel(result.state, family, parameter, now) : {
    title: "Cockpit",
    sections: [{ rows: [{ text: result.message }, { text: "In Scriptable prüfen", tone: "muted" }] }],
  };
  const status = result.fetchedAt ? cacheLabel(result.fetchedAt, now) : null;
  return renderWidget(model, family, validPwa ? pwaUrl : null, now, status);
}

async function runWidget() {
  if (config.runsInWidget) {
    const family = config.widgetFamily === "extraLarge" ? "large" : config.widgetFamily;
    Script.setWidget(await buildWidget(family ?? "small", args.widgetParameter, SETUP_CODE, PWA_URL));
  } else if (config.runsInApp) {
    const preview = new Alert();
    preview.title = "Cockpit-Vorschau";
    for (const label of ["Klein", "Mittel", "Gross", "Sperrbildschirm"]) preview.addAction(label);
    preview.addCancelAction("Abbrechen");
    const index = await preview.presentSheet();
    if (index >= 0) {
      const family = ["small", "medium", "large", "accessoryRectangular"][index];
      const widget = await buildWidget(family, null, SETUP_CODE, PWA_URL);
      const present = ["presentSmall", "presentMedium", "presentLarge", "presentAccessoryRectangular"][index];
      await widget[present]();
    }
  }
  Script.complete();
}

if (typeof Script !== "undefined") await runWidget();
