import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { Script } from "node:vm";

// Scriptable and Node execute the same single-file script. Only the host APIs are stubbed.
const source = readFileSync(new URL("./Cockpit.js", import.meta.url), "utf8");
const script = new Script(`(async () => {
  ${source}
  return { buildWidget, cacheLabel, clock, day, decodeSetup, formatTodo, selectCalendar, widgetModel };
})()`, { filename: "Cockpit.js" });
const logic = await script.runInNewContext();
const now = new Date("2026-11-16T08:00:00+01:00");
const endpoint = "https://script.google.com/macros/s/test-only/exec";
const pwa = "https://example.test/cockpit/";
const base64 = values => Buffer.from(JSON.stringify(values));
const code = base64({ u: endpoint, k: "x".repeat(32) }).toString("base64url");
const decode = value => Buffer.from(value, "base64").toString("utf8");

function event(title, start, end, allDay = false) {
  return { id: title, title, start, end, allDay };
}

function task(title, due, priority = 0, status = "open") {
  return { title, due, dueHasTime: Boolean(due?.includes("T")), priority, status };
}

function mail(subject, importance, receivedAt, fromName = "Testabsender") {
  return { subject, importance, receivedAt, fromName, fromEmail: "" };
}

function state(overrides = {}) {
  const nextEvent = event("Erster Termin", "2026-11-16T08:30:00+01:00", "2026-11-16T09:30:00+01:00");
  return {
    schema: 1,
    generatedAt: now.toISOString(),
    nextEvent,
    today: [nextEvent, event("Ganzer Tag", "2026-11-16", "2026-11-17", true)],
    todos: [
      task("Ohne Datum"),
      task("Erledigt", "2026-11-14", 2, "done"),
      task("Heute", "2026-11-16"),
      task("Überfällig", "2026-11-15"),
      task("Mit Uhrzeit", "2026-11-16T10:00:00+01:00", 1),
    ],
    mails: [
      mail("Info", 1, "2026-11-16T02:00:00Z"),
      mail("Ältere dringende Mail", 3, "2026-11-15T08:00:00Z"),
      mail("Dringende\nMail", 3, "2026-11-15T11:00:00Z"),
    ],
    ...overrides,
  };
}

const rows = model => Array.from(model.sections, group => Array.from(group.rows, row => row.text));
const headings = model => Array.from(model.sections, group => group.title);

test("setup accepts both Base64 variants and restricts the Apps Script endpoint", () => {
  assert.equal(logic.decodeSetup(code, decode).url, endpoint);
  const padded = base64({ u: endpoint, k: "ü".repeat(32) + "!!" }).toString("base64");
  assert.equal(logic.decodeSetup(padded, decode).key.length, 34);
  assert.throws(() => logic.decodeSetup("broken", decode));
  for (const u of [endpoint.replace("/exec", "/dev"), endpoint + "?key=1", "https://example.test/exec"])
    assert.throws(() => logic.decodeSetup(base64({ u, k: "x".repeat(32) }).toString("base64url"), decode));
});

test("Zurich formatting crosses midnight and both DST transitions", () => {
  assert.equal(logic.day("2026-11-15T23:00:00Z"), "2026-11-16");
  assert.equal(logic.day("2026-03-29"), "2026-03-29");
  assert.equal(logic.clock("2026-03-29T00:59:00Z"), "01:59");
  assert.equal(logic.clock("2026-03-29T01:00:00Z"), "03:00");
  assert.equal(logic.clock("2026-10-25T00:59:00Z"), "02:59");
  assert.equal(logic.clock("2026-10-25T01:00:00Z"), "02:00");
  assert.equal(logic.clock("2026-11-15T23:00:00Z"), "00:00");
  assert.equal(logic.cacheLabel("2026-11-16T06:30:00Z", now), "Stand 07:30");
  assert.equal(logic.cacheLabel("2026-11-15T20:30:00Z", now), "Stand 21:30 · So 15.11.");
});

test("date-only deadlines become overdue at Zurich midnight and timed ones at their exact instant", () => {
  const dateOnly = task("Abgabe", "2026-03-29");
  assert.equal(logic.formatTodo(dateOnly, new Date("2026-03-29T21:59:59Z"), "heute").tone, "ink");
  assert.equal(logic.formatTodo(dateOnly, new Date("2026-03-29T22:00:00Z"), "heute").tone, "danger");
  const timed = task("Abgabe", "2026-10-25T02:30:00+01:00", 2);
  assert.equal(logic.formatTodo(timed, new Date("2026-10-25T00:45:00Z"), "heute").tone, "ink");
  assert.equal(logic.formatTodo(timed, new Date("2026-10-25T01:30:00Z"), "heute").tone, "danger");
});

test("small shows sender, subject, two open tasks and the specified fallbacks", () => {
  const small = overrides => logic.widgetModel(state(overrides), "small", "heute", now);
  assert.deepEqual(rows(small()), [["Dringende Mail"], ["Überfällig", "Mit Uhrzeit"]]);
  assert.equal(small().sections[0].rows[0].detail, "Testabsender");
  assert.deepEqual(rows(small({ mails: [] })), [["Überfällig", "Mit Uhrzeit", "Heute"]]);
  assert.deepEqual(rows(small({ mails: [], todos: [] })), [["08:30 · Erster Termin"]]);
  assert.deepEqual(rows(small({ mails: [], todos: [], today: [], nextEvent: null })), [["Kein nächster Termin"]]);
  const focused = logic.widgetModel(state(), "small", " TODOS ", now);
  assert.deepEqual(rows(focused), [["Überfällig", "Mit Uhrzeit"], ["Dringende Mail"]]);
});

test("medium displays an ordered agenda and three urgent tasks with weekday dates in week mode", () => {
  const medium = logic.widgetModel(state(), "medium", "woche", now);
  assert.deepEqual(headings(medium), ["Heute", "To-dos"]);
  assert.deepEqual(rows(medium), [
    ["Mo 16.11. · Ganztägig · Ganzer Tag", "Mo 16.11. · 08:30 · Erster Termin"],
    ["So 15.11. · Überfällig", "Mo 16.11. 10:00 · Mit Uhrzeit", "Mo 16.11. · Heute"],
  ]);
  assert.deepEqual(headings(logic.widgetModel(state(), "medium", "todos", now)), ["To-dos", "Heute"]);
});

test("large uses the API's partial calendar honestly and accepts a full week when supplied", () => {
  const tomorrow = event("Morgen", "2026-11-17T09:00:00+01:00", "2026-11-17T10:00:00+01:00");
  const fallback = logic.widgetModel(state({ nextEvent: tomorrow, today: [] }), "large", "", now);
  assert.deepEqual(headings(fallback), ["Heute", "Diese Woche", "Nächster Termin", "Wichtige Mails"]);
  assert.deepEqual(rows(fallback), [
    ["Keine Termine"],
    ["Wochenagenda nicht verfügbar"],
    ["Di 17.11. · 09:00 · Morgen"],
    ["Dringende Mail", "Ältere dringende Mail"],
  ]);
  const full = state({ week: [tomorrow, ...state().today] });
  assert.deepEqual(headings(logic.widgetModel(full, "large", "", now)), ["Diese Woche", "Wichtige Mails"]);
  assert.deepEqual(headings(logic.widgetModel(full, "large", "todos", now)), ["To-dos", "Diese Woche", "Wichtige Mails"]);
  assert.deepEqual(headings(logic.widgetModel(full, "large", "heute", now)), ["Heute", "Diese Woche", "Wichtige Mails"]);
});

test("week selection uses local Monday and exclusive ends across DST and cached dates", () => {
  const endedSunday = event("Vorbei", "2026-10-25", "2026-10-26", true);
  const ongoing = event("Mehrtägig", "2026-10-25", "2026-10-27", true);
  const outside = event("Andere Woche", "2026-11-02", "2026-11-03", true);
  const start = new Date("2026-10-25T23:20:00Z");
  const full = state({ generatedAt: start.toISOString(), today: [], week: [outside, endedSunday, ongoing] });
  const model = logic.widgetModel(full, "large", "woche", start);
  assert.deepEqual(rows(model)[0], ["Mo 26.10. · Ganztägig · Mehrtägig"]);
  assert.equal(logic.selectCalendar(full, new Date("2026-10-27T09:00:00Z")).agenda.length, 0);
  const expired = logic.selectCalendar(full, new Date("2026-11-01T23:00:00Z"));
  assert.equal(expired.week, null);
  assert.equal(expired.agenda, null);
  assert.equal(logic.selectCalendar(state(), new Date("2026-11-16T17:00:00Z")).next, null);
});

test("rectangular always shows the next timed event and open task", () => {
  const rect = mode => logic.widgetModel(state(), "accessoryRectangular", mode, now);
  assert.deepEqual(rows(rect("heute")), [["08:30 · Erster Termin", "To-do · Überfällig"]]);
  assert.deepEqual(rows(rect("todos")), [["To-do · Überfällig", "08:30 · Erster Termin"]]);
});

class Stack {
  texts = [];
  addText(text) { this.texts.push(text); return {}; }
  addSpacer() {}
  addStack() { return this; }
  layoutVertically() {}
  topAlignContent() {}
}

async function withHost() {
  let saved;
  let response = { ok: true, data: state() };
  const requests = [];
  const host = {
    files: [],
    requests,
    reply(value) { response = value; },
    setCache(value) { saved = value; },
  };
  const api = await script.runInNewContext({
    Date: class extends Date {
      constructor(...args) { super(...(args.length ? args : [+now])); }
    },
    Data: { fromBase64String: value => ({ toRawString: () => decode(value) }) },
    FileManager: { local: () => ({
      libraryDirectory: () => "/local",
      joinPath: (base, name) => `${base}/${name}`,
      writeString: (path, text) => { host.files.push(path); saved = text; },
      fileExists: () => saved !== undefined,
      readString: () => saved,
    }) },
    Request: class {
      constructor(url) { this.url = url; }
      async loadJSON() {
        requests.push(this);
        if (response instanceof Error) throw response;
        return response;
      }
    },
    ListWidget: class extends Stack { setPadding() {} },
    Size: class {},
    Color: class {
      constructor(hex) { this.hex = hex; }
      static dynamic(light, dark) { return { light, dark }; }
    },
    Font: { systemFont: size => size, semiboldSystemFont: size => size },
  });
  return { ...host, build: (family, setup = code) => api.buildWidget(family, null, setup, pwa) };
}

test("each size renders a fresh, cached and cache-miss state, linked to the PWA", async () => {
  const host = await withHost();
  for (const family of ["small", "medium", "large", "accessoryRectangular"]) {
    host.reply({ ok: true, data: state() });
    const fresh = await host.build(family);
    assert.equal(fresh.url, pwa);
    assert.equal(+fresh.refreshAfterDate, +now + 15 * 60 * 1000);
    assert(fresh.texts.some(text => text.includes("Überfällig") || text.includes("Dringende Mail")));
    if (family === "accessoryRectangular") assert.equal(fresh.backgroundColor, undefined);
    else {
      assert.equal(fresh.backgroundColor.light.hex, "#f6f7f3");
      assert.equal(fresh.backgroundColor.dark.hex, "#161e1a");
    }
    host.reply(new Error("offline"));
    const saved = await host.build(family);
    assert.deepEqual(saved.texts.slice(0, -1), fresh.texts);
    assert.match(saved.texts.at(-1), /^Stand \d\d:\d\d$/);
    host.setCache("{broken");
    assert((await host.build(family)).texts.includes("Verbindung prüfen"));
  }
  assert(host.files.every(path => path === "/local/cockpit-widget-state.json"));
  assert(host.requests.every(request => request.url === endpoint && request.method === "POST"));
  assert.deepEqual(JSON.parse(host.requests[0].body), { key: "x".repeat(32), action: "getWidget", payload: {} });
});

test("missing and invalid setup avoid network requests; a different endpoint cannot read the cache", async () => {
  const host = await withHost();
  assert((await host.build("small", "")).texts.includes("Setup-Code einfügen"));
  assert((await host.build("small", "invalid")).texts.includes("Setup-Code prüfen"));
  assert.equal(host.requests.length, 0);
  await host.build("small");
  host.reply({ ok: false, error: { code: "unauthorized" } });
  assert.match((await host.build("small")).texts.at(-1), /^Stand /);
  const other = base64({ u: endpoint.replace("test-only", "other"), k: "y".repeat(32) }).toString("base64url");
  assert((await host.build("small", other)).texts.includes("Setup-Code prüfen"));
});
