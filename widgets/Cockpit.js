// Paste these values in Scriptable on your device.
const SETUP_CODE = "";
const PWA_URL = "";

// Widget parameter (long-press the widget → Edit Widget → Parameter), optional:
//   heute (default) · todos · termine · mails  – which card comes first and gets the most room.
//   Add "ohne lektionen" (e.g. "termine, ohne lektionen") to hide lectures under "Nächste Termine".

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

// Layout metrics in points (D27). The model plans rows against these, the renderer uses the same
// values, so a card never overflows the widget: Scriptable clips instead of scrolling.
const METRICS = {
  pad: 8, // widget padding
  gap: 6, // between cards
  cardPad: 7, // inside a card, top and bottom
  header: 22, // icon tile and title line
  headerGap: 4,
  line: 16, // one 13 pt line
  detail: 13.5, // one 11 pt line
  separator: 6.5, // 3 + 0.5 + 3
  status: 13,
};
// Usable height inside the widget padding (iPhone sizes; larger devices just get more air).
const HEIGHT = { small: 142, medium: 142, large: 338 };
const ROW_HEIGHT = { todos: METRICS.line, events: METRICS.line + METRICS.detail + 1, mails: METRICS.line + METRICS.detail + 1 };
const MAX_ROWS = { todos: 6, events: 4, mails: 3 };
const TARGET_ROWS = { todos: 3, events: 2, mails: 2 };

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

/** "Heute", "Morgen", "Fr" (this week) or "Mo 23.11." for a Zurich day. */
function relativeDay(isoDay, today) {
  if (isoDay === today) return "Heute";
  if (isoDay === addDays(today, 1)) return "Morgen";
  if (isoDay > today && isoDay < addDays(today, 7)) return WEEKDAYS[weekday(isoDay)];
  return dateLabel(isoDay);
}

function formatTodo(todo, now) {
  const today = day(now);
  const dueDay = todo.due ? day(todo.due) : "";
  const timed = todo.due && todo.dueHasTime && !DATE_ONLY.test(todo.due);
  const overdue = dueDay && (dueDay < today || (timed && Date.parse(todo.due) <= +now));
  let detail = "";
  if (overdue) detail = dueDay < today ? "Überfällig" : `Fällig ${clock(todo.due)}`;
  else if (dueDay) detail = relativeDay(dueDay, today) + (timed ? ` ${clock(todo.due)}` : "");
  return { text: singleLine(todo.title, "To-do"), detail, tone: overdue ? "danger" : "ink" };
}

/** "Heute, 12:30", "Morgen · ganztägig", "Jetzt · bis 14:55". */
function eventWhen(event, now) {
  const today = day(now);
  const startDay = day(event.start);
  if (event.allDay) return `${relativeDay(startDay < today ? today : startDay, today)} · ganztägig`;
  if (Date.parse(event.start) <= +now) return `Jetzt · bis ${clock(event.end)}`;
  return `${relativeDay(startDay, today)}, ${clock(event.start)}`;
}

function formatEvent(event, now) {
  const mark = event.kind === "exam" || event.kind === "deadline" ? "exam"
    : event.kind === "lecture" || event.routine ? "lecture" : "event";
  const room = event.kind === "lecture" && event.location ? ` · ${singleLine(event.location)}` : "";
  return { text: singleLine(event.title, "Termin"), detail: eventWhen(event, now) + room, mark };
}

/** Sensitive mails stay generic in the widget (home and Lock Screen are visible to others, D25). */
function formatMail(mail) {
  const sender = singleLine(mail.fromName) || singleLine(mail.fromEmail, "Unbekannter Absender");
  return mail.sensitive
    ? { text: "Vertrauliche Nachricht", detail: singleLine(mail.category, "Vertraulich"), tone: "ink", mark: "mail" }
    : { text: sender, detail: singleLine(mail.subject, "Ohne Betreff"), tone: "ink", mark: mail.importance === 3 ? "urgent" : "mail" };
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
  return mails.filter(mail => mail.importance >= 2)
    .sort((a, b) => b.importance - a.importance || Date.parse(b.receivedAt) - Date.parse(a.receivedAt));
}

function eventOrder(a, b) {
  return day(a.start).localeCompare(day(b.start)) ||
    Number(b.allDay) - Number(a.allDay) || Date.parse(a.start) - Date.parse(b.start);
}

function eventEndMs(event) {
  return event.allDay ? Date.parse(`${event.end}T00:00:00Z`) - 3600000 : Date.parse(event.end);
}

/**
 * Candidates for "Nächste Termine": `upcoming` from the backend (D27), else (older cached
 * responses) today, the week and nextEvent. Not ended, deduplicated, chronological.
 */
function upcomingCandidates(state, now) {
  const source = Array.isArray(state.upcoming) && state.upcoming.every(validEvent)
    ? state.upcoming
    : [state.nextEvent, ...state.today, ...(Array.isArray(state.week) ? state.week.filter(validEvent) : [])];
  const seen = new Set();
  return source.filter(event => {
    if (!event || seen.has(event.id) || eventEndMs(event) <= +now) return false;
    if (event.routine && event.kind !== "lecture") return false;
    seen.add(event.id);
    return true;
  }).sort(eventOrder);
}

/** Appointments first, lectures fill the remaining rows; shown chronologically. */
function pickEvents(candidates, count, withLectures) {
  const isLecture = event => event.kind === "lecture";
  const main = candidates.filter(event => !isLecture(event));
  const lectures = withLectures ? candidates.filter(isLecture) : [];
  return [...main.slice(0, count), ...lectures.slice(0, Math.max(0, count - main.length))].sort(eventOrder);
}

function parseParameter(family, parameter) {
  const text = typeof parameter === "string" ? parameter.trim().toLowerCase() : "";
  const modes = { heute: "heute", todos: "todos", "to-dos": "todos", termine: "termine", woche: "termine", mails: "mails" };
  const first = text.split(/[,;\s]+/).find(word => modes[word]);
  return { mode: modes[first] ?? "heute", lectures: !/ohne\s*lektion/.test(text) };
}

function cardHeight(card) {
  const rows = Math.max(1, card.rows.length);
  const rowHeight = card.rows.length ? ROW_HEIGHT[card.kind] : METRICS.line;
  const header = card.compact ? 0 : METRICS.header + METRICS.headerGap;
  return 2 * METRICS.cardPad + header + rows * rowHeight + (rows - 1) * METRICS.separator;
}

function plannedHeight(cards, horizontal) {
  if (horizontal) return Math.max(...cards.map(cardHeight));
  return cards.reduce((sum, card) => sum + cardHeight(card), 0) + (cards.length - 1) * METRICS.gap;
}

/**
 * Fills each card with rows while the planned height fits: first up to the target counts of the
 * template (3 to-dos, 2 appointments, 2 mails), then the first card up to its maximum.
 */
function fillCards(cards, budget, horizontal) {
  for (const card of cards) card.rows = [];
  const take = (card, limit) => {
    while (card.rows.length < Math.min(limit, card.items.length)) {
      card.rows.push(null); // only the count matters while planning
      if (plannedHeight(cards, horizontal) > budget) {
        card.rows.pop();
        return;
      }
    }
  };
  for (const card of cards) take(card, 1);
  for (const card of cards) take(card, card.target ?? TARGET_ROWS[card.kind]);
  for (const card of cards) take(card, MAX_ROWS[card.kind]);
  return cards.map(({ items, format, pick, target, ...card }) => ({
    ...card,
    rows: (pick ? pick(card.rows.length) : items.slice(0, card.rows.length)).map(format),
    more: Math.max(0, items.length - card.rows.length),
  }));
}

function widgetModel(state, family, parameter, now, status = null) {
  const { mode, lectures } = parseParameter(family, parameter);
  const todos = selectTodos(state.todos);
  const mails = selectMails(state.mails);
  const candidates = upcomingCandidates(state, now);
  const events = pickEvents(candidates, MAX_ROWS.events, lectures);

  if (family === "accessoryRectangular") {
    const task = todos[0] ? formatTodo(todos[0], now) : null;
    const taskRow = task
      ? { text: `To-do · ${task.text}`, tone: task.tone }
      : { text: "Kein offenes To-do", tone: "muted" };
    const nextEvent = pickEvents(candidates, 1, false)[0];
    const next = nextEvent
      ? { text: `${eventWhen(nextEvent, now)} · ${singleLine(nextEvent.title, "Termin")}` }
      : { text: "Kein nächster Termin", tone: "muted" };
    return { family, sections: [{ rows: mode === "todos" ? [taskRow, next] : [next, taskRow] }], status };
  }

  const count = Number.isInteger(state.todoCount) ? state.todoCount : todos.length;
  const card = {
    todos: () => ({
      kind: "todos", title: "To-dos", items: todos, format: todo => formatTodo(todo, now),
      count: family === "large" ? `${count} ${count === 1 ? "Aufgabe" : "Aufgaben"}` : "",
      narrow: family !== "large", // no due label: it would crowd out the title (overdue stays red)
      empty: "Keine offenen To-dos",
    }),
    events: () => ({
      kind: "events", title: family === "large" ? "Nächste Termine" : "Termine", items: events, format: event => formatEvent(event, now),
      pick: n => pickEvents(candidates, n, lectures),
      empty: "Keine Termine in den nächsten 7 Tagen",
    }),
    mails: compact => ({
      kind: "mails", title: family === "large" ? "Wichtige neue Mails" : "Wichtige Mails", items: mails, format: formatMail,
      empty: "Keine wichtigen Mails", compact,
    }),
  };
  const order = {
    heute: ["todos", "events", "mails"],
    todos: ["todos", "events", "mails"],
    termine: ["events", "todos", "mails"],
    mails: ["mails", "todos", "events"],
  }[mode];

  let cards;
  if (family === "small") {
    // One card; with the default mode the most important mail sits below as a compact strip (D21).
    const main = mode === "heute" ? (todos.length || !events.length ? "todos" : "events") : order[0];
    cards = [main === "mails" ? card.mails(false) : card[main]()];
    if (mode === "heute" && main === "todos" && mails.length) cards.push({ ...card.mails(true), target: 1 });
  } else if (family === "medium") {
    cards = (mode === "heute" ? ["events", "todos"] : order.slice(0, 2)).map(kind => card[kind](false));
  } else {
    cards = order.map(kind => card[kind](false));
  }
  const budget = HEIGHT[family === "small" || family === "medium" ? family : "large"] - (status ? METRICS.status : 0);
  return { family, cards: fillCards(cards, budget, family === "medium"), status };
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

// --- Rendering (Scriptable only) ---------------------------------------------------------

function colors() {
  const dynamic = (light, dark) => Color.dynamic(new Color(light), new Color(dark));
  // iOS system colours, light/dark (D27, template widgets/… in private/): tinted cards on white.
  return {
    background: dynamic("#ffffff", "#1c1c1e"),
    ink: dynamic("#000000", "#ffffff"),
    muted: dynamic("#6e6e73", "#aeaeb2"),
    separator: dynamic("#d8d8dd", "#3a3a3c"),
    danger: dynamic("#d70015", "#ff6961"),
    circle: dynamic("#a1a1a6", "#8e8e93"),
    todos: { card: dynamic("#f2f2f7", "#2c2c2e"), tile: dynamic("#8e8e93", "#636366") },
    events: { card: dynamic("#e9f1fe", "#13253d"), tile: dynamic("#0a7aff", "#0a84ff") },
    mails: { card: dynamic("#fff2e6", "#3a2a19"), tile: dynamic("#ff9500", "#ff9f0a") },
    mark: {
      event: dynamic("#0a7aff", "#0a84ff"),
      lecture: dynamic("#8fb9f5", "#4f7fbf"),
      exam: dynamic("#af52de", "#bf5af2"),
      mail: dynamic("#ff9500", "#ff9f0a"),
      urgent: dynamic("#ff3b30", "#ff453a"),
    },
  };
}

const ICONS = { todos: "checklist", events: "calendar", mails: "envelope.fill" };

function symbol(name, font) {
  // Runtime system symbols: nothing is embedded in the repo (D27, AGENTS.md "Lizenz").
  if (typeof SFSymbol === "undefined") return null;
  const s = SFSymbol.named(name);
  if (!s) return null;
  s.applyFont(font);
  return s.image;
}

function renderText(stack, text, font, color, lines = 1) {
  const label = stack.addText(text);
  label.font = font;
  if (color) label.textColor = color;
  label.lineLimit = lines;
  label.minimumScaleFactor = 0.8;
  return label;
}

function renderHeader(stack, card, palette) {
  const row = stack.addStack();
  row.centerAlignContent();
  row.size = new Size(0, METRICS.header);
  const tile = row.addStack();
  tile.size = new Size(METRICS.header, METRICS.header);
  tile.cornerRadius = 6;
  tile.backgroundColor = palette[card.kind].tile;
  tile.centerAlignContent();
  const image = symbol(ICONS[card.kind], Font.semiboldSystemFont(12));
  if (image) {
    const icon = tile.addImage(image);
    icon.imageSize = new Size(13, 13);
    icon.tintColor = Color.white();
  }
  row.addSpacer(8);
  renderText(row, card.title, Font.boldSystemFont(15), palette.ink);
  row.addSpacer();
  if (card.count) renderText(row, card.count, Font.systemFont(12), palette.muted);
  stack.addSpacer(METRICS.headerGap);
}

function renderSeparator(stack, palette, indent) {
  stack.addSpacer(3);
  const line = stack.addStack();
  line.size = new Size(0, 0.5);
  line.addSpacer(indent);
  const rule = line.addStack();
  rule.size = new Size(0, 0.5);
  rule.backgroundColor = palette.separator;
  rule.addSpacer();
  stack.addSpacer(3);
}

function renderTodoRow(stack, row, palette) {
  const line = stack.addStack();
  line.centerAlignContent();
  line.size = new Size(0, METRICS.line);
  const image = symbol("circle", Font.regularSystemFont(13));
  if (image) {
    const icon = line.addImage(image);
    icon.imageSize = new Size(14, 14);
    icon.tintColor = palette.circle;
  }
  line.addSpacer(8);
  renderText(line, row.text, Font.systemFont(13), palette[row.tone ?? "ink"]);
  line.addSpacer();
  if (row.detail) {
    line.addSpacer(6);
    renderText(line, row.detail, Font.systemFont(11), row.tone === "danger" ? palette.danger : palette.muted);
  }
}

function renderTwoLineRow(stack, row, palette, kind) {
  const line = stack.addStack();
  line.size = new Size(0, ROW_HEIGHT[kind]);
  line.centerAlignContent();
  const mark = line.addStack();
  if (kind === "events") {
    mark.size = new Size(3, ROW_HEIGHT[kind] - 3);
    mark.cornerRadius = 1.5;
  } else {
    mark.size = new Size(8, 8);
    mark.cornerRadius = 4;
  }
  mark.backgroundColor = palette.mark[row.mark] ?? palette.mark.event;
  line.addSpacer(kind === "events" ? 9 : 8);
  const text = line.addStack();
  text.layoutVertically();
  renderText(text, row.text, Font.semiboldSystemFont(13), palette[row.tone ?? "ink"]);
  text.addSpacer(1);
  renderText(text, row.detail ?? "", Font.systemFont(11), palette.muted);
  line.addSpacer();
}

function renderCard(parent, card, palette) {
  const box = parent.addStack();
  box.layoutVertically();
  box.backgroundColor = palette[card.kind]?.card ?? palette.todos.card;
  box.cornerRadius = 14;
  box.setPadding(METRICS.cardPad, 10, METRICS.cardPad, 10);
  if (!card.compact) renderHeader(box, card, palette);
  if (!card.rows.length) {
    const empty = box.addStack();
    empty.size = new Size(0, METRICS.line);
    empty.centerAlignContent();
    renderText(empty, card.empty, Font.systemFont(13), palette.muted);
    empty.addSpacer();
  }
  for (const [index, row] of card.rows.entries()) {
    if (index > 0 && card.kind !== "message") renderSeparator(box, palette, card.kind === "events" ? 12 : 22);
    else if (index > 0) box.addSpacer(4);
    if (card.kind === "todos") renderTodoRow(box, card.narrow ? { ...row, detail: "" } : row, palette);
    else if (card.kind === "message") renderText(box, row.text, Font.semiboldSystemFont(13), palette[row.tone]);
    else renderTwoLineRow(box, row, palette, card.kind);
  }
  return box;
}

function renderLock(widget, model, status) {
  widget.setPadding(0, 0, 0, 0);
  // The Lock Screen supplies its own wallpaper-dependent tint.
  for (const [index, row] of model.sections[0].rows.entries()) {
    if (index > 0) widget.addSpacer(3);
    renderText(widget, row.text, Font.systemFont(12));
  }
  if (status) {
    widget.addSpacer(2);
    renderText(widget, status, Font.systemFont(10));
  }
}

function renderWidget(model, pwaUrl, now) {
  const widget = new ListWidget();
  widget.refreshAfterDate = new Date(+now + REFRESH_MS);
  if (pwaUrl) widget.url = pwaUrl;
  if (model.family === "accessoryRectangular") {
    renderLock(widget, model, model.status);
    return widget;
  }
  const palette = colors();
  widget.backgroundColor = palette.background;
  widget.setPadding(METRICS.pad, METRICS.pad, METRICS.pad, METRICS.pad);
  if (model.family === "medium") {
    const columns = widget.addStack();
    columns.topAlignContent();
    for (const [index, card] of model.cards.entries()) {
      if (index > 0) columns.addSpacer(METRICS.gap);
      const box = renderCard(columns, card, palette);
      box.size = new Size(0, HEIGHT.medium - (model.status ? METRICS.status : 0));
      box.addSpacer();
    }
  } else {
    for (const [index, card] of model.cards.entries()) {
      if (index > 0) widget.addSpacer(METRICS.gap);
      renderCard(widget, card, palette);
    }
  }
  widget.addSpacer();
  if (model.status) {
    const line = widget.addStack();
    line.addSpacer();
    renderText(line, model.status, Font.systemFont(10), palette.muted);
  }
  return widget;
}

function messageModel(family, message) {
  if (family === "accessoryRectangular")
    return { family, sections: [{ rows: [{ text: message }, { text: "In Scriptable prüfen", tone: "muted" }] }] };
  return {
    family,
    cards: [{ kind: "message", title: "Cockpit", compact: true, more: 0, empty: "",
      rows: [{ text: "Cockpit", tone: "ink" }, { text: message, tone: "ink" }, { text: "In Scriptable öffnen und prüfen", tone: "muted" }] }],
    status: null,
  };
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
  const status = result.fetchedAt ? cacheLabel(result.fetchedAt, now) : null;
  const model = result.state ? widgetModel(result.state, family, parameter, now, status) : messageModel(family, result.message);
  return renderWidget(model, validPwa ? pwaUrl : null, now);
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
