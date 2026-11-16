import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { Script } from "node:vm";

// Scriptable and Node execute the same single-file script. Only the host APIs are stubbed.
const source = readFileSync(new URL("./Cockpit.js", import.meta.url), "utf8");
const script = new Script(`(async () => {
  ${source}
  return { buildWidget, cacheLabel, clock, day, decodeSetup, formatTodo, widgetModel, plannedHeight, HEIGHT, METRICS };
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
const kinds = model => Array.from(model.cards, card => card.kind);
const texts = (model, kind) => Array.from(model.cards.find(card => card.kind === kind)?.rows ?? [], row => row.text);

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
  assert.equal(logic.formatTodo(dateOnly, new Date("2026-03-29T21:59:59Z")).tone, "ink");
  assert.equal(logic.formatTodo(dateOnly, new Date("2026-03-29T22:00:00Z")).tone, "danger");
  assert.equal(logic.formatTodo(dateOnly, new Date("2026-03-29T22:00:00Z")).detail, "Überfällig");
  const timed = task("Abgabe", "2026-10-25T02:30:00+01:00", 2);
  assert.equal(logic.formatTodo(timed, new Date("2026-10-25T00:45:00Z")).tone, "ink");
  assert.equal(logic.formatTodo(timed, new Date("2026-10-25T01:30:00Z")).tone, "danger");
  assert.equal(logic.formatTodo(task("x", "2026-11-17"), now).detail, "Morgen");
  assert.equal(logic.formatTodo(task("x", "2026-11-20"), now).detail, "Fr");
  assert.equal(logic.formatTodo(task("x", "2026-11-23"), now).detail, "Mo 23.11.");
});

// D27: layout of the template (private/Vorlage Widget.PNG): tinted cards To-dos, Nächste Termine, Mails.
const lecture = (title, start, end) => ({ ...event(title, start, end), kind: "lecture", routine: true, location: "R1" });
const upcoming = [
  event("Erster Termin", "2026-11-16T08:30:00+01:00", "2026-11-16T09:30:00+01:00"),
  lecture("Vorlesung", "2026-11-16T12:30:00+01:00", "2026-11-16T14:55:00+01:00"),
  event("Projektmeeting", "2026-11-17T09:00:00+01:00", "2026-11-17T10:00:00+01:00"),
];

test("large follows the template: 3 to-dos with count, 2 appointments, 2 important mails", () => {
  const large = logic.widgetModel(state({ upcoming, todoCount: 4 }), "large", "", now);
  assert.deepEqual(kinds(large), ["todos", "events", "mails"]);
  assert.deepEqual(texts(large, "todos"), ["Überfällig", "Mit Uhrzeit", "Heute"]);
  assert.equal(large.cards[0].count, "4 Aufgaben");
  assert.equal(large.cards[0].rows[0].tone, "danger");
  assert.deepEqual(texts(large, "events"), ["Erster Termin", "Projektmeeting"]);
  assert.equal(large.cards[1].rows[0].detail, "Heute, 08:30");
  assert.equal(large.cards[1].rows[1].detail, "Morgen, 09:00");
  assert.deepEqual(texts(large, "mails"), ["Testabsender", "Testabsender"]);
  assert.equal(large.cards[2].rows[0].detail, "Dringende Mail");
  assert.equal(large.cards[2].rows[0].mark, "urgent");
  assert.ok(!texts(large, "mails").includes("Info"));
});

test("lectures fill free appointment rows, never displace appointments; 'ohne Lektionen' hides them", () => {
  const one = [upcoming[1], upcoming[2]];
  const model = logic.widgetModel(state({ upcoming: one }), "large", "", now);
  assert.deepEqual(texts(model, "events"), ["Vorlesung", "Projektmeeting"]);
  assert.equal(model.cards[1].rows[0].detail, "Heute, 12:30 · R1");
  assert.equal(model.cards[1].rows[0].mark, "lecture");
  const hidden = logic.widgetModel(state({ upcoming: one }), "large", "termine, ohne Lektionen", now);
  assert.deepEqual(texts(hidden, "events"), ["Projektmeeting"]);
  assert.equal(hidden.cards[0].kind, "events");
});

test("sensitive mails stay generic", () => {
  const secret = { ...mail("Arztbericht", 3, "2026-11-16T06:00:00Z", "Praxis"), sensitive: true, category: "Gesundheit" };
  const model = logic.widgetModel(state({ mails: [secret] }), "large", "", now);
  assert.deepEqual(JSON.parse(JSON.stringify(model.cards[2].rows.map(r => [r.text, r.detail]))), [["Vertrauliche Nachricht", "Gesundheit"]]);
});

test("every size stays within its height budget, even with much data and a cache status", () => {
  const many = Array.from({ length: 9 }, (_, i) => task(`Aufgabe ${i}`, "2026-11-18"));
  const mails = Array.from({ length: 3 }, (_, i) => mail(`Mail ${i}`, 2, "2026-11-16T06:00:00Z"));
  const busy = state({ todos: many, mails, upcoming: [...upcoming, event("Später", "2026-11-18T09:00:00+01:00", "2026-11-18T10:00:00+01:00")] });
  for (const family of ["small", "medium", "large"])
    for (const param of ["", "todos", "termine", "mails"])
      for (const status of [null, "Stand 07:30"]) {
        const model = logic.widgetModel(busy, family, param, now, status);
        const height = logic.plannedHeight(model.cards, family === "medium") + (status ? logic.METRICS.status : 0);
        assert.ok(height <= logic.HEIGHT[family], `${family}/${param}/${status}: ${height}`);
        assert.ok(model.cards.every(card => card.rows.length >= 1), `${family}/${param}: empty card`);
      }
  const large = logic.widgetModel(busy, "large", "", now);
  assert.deepEqual([...large.cards.map(card => card.rows.length)], [3, 2, 2]);
  assert.equal(large.cards[0].more, 6);
});

test("medium shows two cards side by side; small one card plus the most important mail", () => {
  const s = state({ upcoming });
  assert.deepEqual(kinds(logic.widgetModel(s, "medium", "", now)), ["events", "todos"]);
  assert.deepEqual(kinds(logic.widgetModel(s, "medium", "todos", now)), ["todos", "events"]);
  assert.deepEqual(kinds(logic.widgetModel(s, "medium", "mails", now)), ["mails", "todos"]);
  const small = logic.widgetModel(s, "small", "heute", now);
  assert.deepEqual(kinds(small), ["todos", "mails"]);
  assert.equal(small.cards[1].compact, true);
  assert.deepEqual(texts(small, "todos"), ["Überfällig", "Mit Uhrzeit"]);
  assert.deepEqual(kinds(logic.widgetModel(state({ upcoming, mails: [] }), "small", "", now)), ["todos"]);
  assert.deepEqual(kinds(logic.widgetModel(state({ upcoming, todos: [] }), "small", "", now)), ["events"]);
  assert.deepEqual(kinds(logic.widgetModel(s, "small", " TERMINE ", now)), ["events"]);
  const empty = logic.widgetModel(state({ todos: [], mails: [], today: [], nextEvent: null, upcoming: [] }), "small", "", now);
  assert.deepEqual(kinds(empty), ["todos"]);
  assert.equal(empty.cards[0].rows.length, 0);
  assert.equal(empty.cards[0].empty, "Keine offenen To-dos");
});

test("an older cached response without `upcoming` falls back to today, week and nextEvent", () => {
  const tomorrow = event("Morgen", "2026-11-17T09:00:00+01:00", "2026-11-17T10:00:00+01:00");
  const model = logic.widgetModel(state({ week: [tomorrow] }), "large", "", now);
  assert.deepEqual(texts(model, "events"), ["Ganzer Tag", "Erster Termin"]);
  assert.equal(model.cards[1].rows[0].detail, "Heute · ganztägig");
  const later = logic.widgetModel(state({ week: [tomorrow] }), "large", "", new Date("2026-11-16T09:00:00+01:00"));
  assert.equal(later.cards[1].rows[1].detail, "Jetzt · bis 09:30");
});

test("rectangular always shows the next appointment and open task", () => {
  const rect = mode => logic.widgetModel(state({ upcoming }), "accessoryRectangular", mode, now);
  assert.deepEqual(rows(rect("heute")), [["Heute, 08:30 · Erster Termin", "To-do · Überfällig"]]);
  assert.deepEqual(rows(rect("todos")), [["To-do · Überfällig", "Heute, 08:30 · Erster Termin"]]);
});

class Stack {
  texts = [];
  addText(text) { this.texts.push(text); return {}; }
  addSpacer() {}
  addImage() { return {}; }
  addStack() { const child = new Stack(); child.texts = this.texts; return child; }
  layoutVertically() {}
  topAlignContent() {}
  centerAlignContent() {}
  setPadding() {}
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
      static white() { return new this("#ffffff"); }
    },
    Font: { systemFont: size => size, semiboldSystemFont: size => size, boldSystemFont: size => size, regularSystemFont: size => size },
    SFSymbol: { named: () => ({ applyFont() {}, image: {} }) },
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
      assert.equal(fresh.backgroundColor.light.hex, "#ffffff");
      assert.equal(fresh.backgroundColor.dark.hex, "#1c1c1e");
    }
    host.reply(new Error("offline"));
    const saved = await host.build(family);
    // The status line takes room, so the cached view may distribute rows differently.
    assert.equal(saved.texts[0], fresh.texts[0]);
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
