const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const L = require("./load.js");
const plain = (o) => JSON.parse(JSON.stringify(o));

const mock = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "docs", "mock-state.json"), "utf8"));
const NOW = new Date("2026-11-16T06:12:00Z"); // 07:12 Zurich, matches the mock

test("config defaults and overrides", () => {
  const c = L.parseConfigRows([["mode", "active"], ["aiModel", ""], ["", "x"]]);
  assert.equal(c.mode, "active");
  assert.equal(c.aiModel, "gemini-3.5-flash-lite");
  assert.equal(c.quietFrom, "22:00");
});

test("categories: invalid JSON or entries are dropped", () => {
  assert.deepEqual(plain(L.parseCategories("{oops")), []);
  const cats = L.parseCategories(
    JSON.stringify([{ id: "a", label: "A", color: "#fff", group: "schule" }, { id: 1 }, { id: "b", label: "B" }]),
  );
  assert.deepEqual(plain(cats), [
    { id: "a", label: "A", color: "#fff", group: "schule" },
    { id: "b", label: "B", color: "#D9DDE3", group: "privat" },
  ]);
});

test("eventKind from calendar name and tag/title", () => {
  const c = { calLectures: "Plan", calExams: "Exams" };
  assert.equal(L.eventKind("Plan", c, "", "Analysis"), "lecture");
  assert.equal(L.eventKind("Exams", c, "deadline", "Test"), "deadline");
  assert.equal(L.eventKind("Exams", c, "", "Abgabe Bericht"), "deadline");
  assert.equal(L.eventKind("Exams", c, "", "Modulpruefung"), "exam");
  assert.equal(L.eventKind("Familie", c, "", "Essen"), "private");
  assert.equal(L.eventKind("Plan", { calLectures: "", calExams: "" }, "", "x"), "private");
});

test("selectTodos: open + done within 7 days, sorted", () => {
  const extra = { ...mock.todos[8], id: "old", doneAt: "2026-11-01T10:00:00+01:00" };
  const out = L.selectTodos([...mock.todos, extra], NOW);
  assert.ok(!out.some((t) => t.id === "old"));
  assert.equal(out.length, mock.todos.length);
  const open = out.filter((t) => t.status === "open");
  assert.equal(open[0].id, "4f1c2a10-0002-4c3e-9a10-000000000002"); // overdue first
  assert.equal(open[open.length - 1].due, undefined); // no due date last
  assert.ok(out.findIndex((t) => t.status === "done") >= open.length);
});

test("rowToMail + selectMails: filters importance 0, dismissed and old mails", () => {
  const toRow = (m, dismissed) =>
    L.MAIL_COLUMNS.map((c) => (c === "dismissed" ? dismissed : m[c] === undefined ? "" : m[c]));
  const rows = mock.mails.map((m) => toRow(m, false));
  rows.push(toRow({ ...mock.mails[0], id: "zero", importance: 0 }, false));
  rows.push(toRow({ ...mock.mails[0], id: "gone" }, "TRUE"));
  rows.push(toRow({ ...mock.mails[0], id: "old", receivedAt: "2026-10-01T10:00:00+02:00" }, false));
  const out = L.selectMails(rows.map(L.rowToMail), NOW);
  assert.equal(out.length, mock.mails.length);
  assert.deepEqual(plain(out[0]), mock.mails[0]); // round-trip, newest first
});

test("buildState has the mock's shape; buildWidget picks the right items", () => {
  const state = L.buildState({
    now: NOW, health: mock.health, events: [...mock.events].reverse(), exams: mock.exams,
    todos: mock.todos, mails: mock.mails.map((m) => ({ mail: m, dismissed: false })),
    briefing: mock.briefing, settings: mock.settings,
  });
  assert.equal(state.generatedAt, "2026-11-16T07:12:00+01:00");
  assert.deepEqual(plain(state.events), mock.events); // re-sorted
  assert.deepEqual(Object.keys(state).sort(), Object.keys(mock).sort());
  const w = L.buildWidget(state, NOW);
  assert.equal(w.nextEvent.start, "2026-11-16T08:15:00+01:00");
  assert.equal(w.today.length, 2);
  assert.equal(w.todos.length, 5);
  assert.ok(w.todos.every((t) => t.status === "open"));
  assert.equal(w.mails[0].importance, 3);
  assert.equal(w.mails.length, 3);
});

test("buildWidget: all-day events count for every covered day", () => {
  const ev = { id: "x", calendar: "P", kind: "private", title: "WE", start: "2026-11-28", end: "2026-11-30", allDay: true };
  const s = { generatedAt: "", health: {}, events: [ev], todos: [], mails: [] };
  assert.equal(L.buildWidget(s, new Date("2026-11-29T10:00:00Z")).today.length, 1);
  assert.equal(L.buildWidget(s, new Date("2026-11-30T10:00:00Z")).today.length, 0);
  assert.equal(L.buildWidget(s, new Date("2026-11-29T10:00:00Z")).nextEvent, null);
});

test("countRecentErrors", () => {
  const rows = [
    ["2026-11-16T06:00:00+01:00", "error", "tick", "x"],
    ["2026-11-14T06:00:00+01:00", "error", "tick", "old"],
    [new Date("2026-11-16T05:00:00Z"), "error", "api", "date cell"],
    ["2026-11-16T06:00:00+01:00", "info", "tick", "ok"],
  ];
  assert.equal(L.countRecentErrors(rows, NOW), 2);
});
