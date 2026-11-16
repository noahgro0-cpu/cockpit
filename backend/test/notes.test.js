// D28: note pages, images, event edits and hand-picked event subjects (invented data only).
const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("./load.js");

const plain = (v) => JSON.parse(JSON.stringify(v));
const cats = [
  { id: "physik", label: "Physik", color: "#fff", group: "schule" },
  { id: "analysis", label: "Analysis", color: "#fff", group: "schule" },
  { id: "privat", label: "Privat", color: "#fff", group: "privat" },
];

test("eventKey and eventSubjectMap", () => {
  assert.equal(L.eventKey("abc123@google.com_1700000000000"), "abc123@google.com");
  assert.equal(L.eventKey("a_b_17"), "a_b");
  assert.deepEqual(plain(L.eventSubjectMap([["k1", "physik", ""], ["", "x", ""], ["k2", "-", ""]])), { k1: "physik", k2: "-" });
});

test("assignEventSubjects: hand-picked subject wins for the whole series, '-' removes it", () => {
  const matchers = L.subjectMatchers(cats, []);
  const events = [
    { id: "s1@x_1", title: "Physik Labor" },
    { id: "s1@x_2", title: "Physik Labor" },
    { id: "s2@x_3", title: "Analysis" },
    { id: "s3@x_4", title: "Treffen", subject: "physik" },
  ];
  const out = L.assignEventSubjects(events, matchers, { "s1@x": "analysis", "s2@x": "-", "s3@x": "gone" });
  assert.deepEqual(out.map((e) => e.subject ?? ""), ["analysis", "analysis", "", "physik"]);
});

test("mergeEdit: html marker, no duplicate after the other device keeps editing", () => {
  const h = L.textHash;
  const a = "<p>Gerät A</p>";
  // B started from "" (hash of empty), server already has A's text -> both kept
  const first = L.mergeEdit(a, "<p>Gerät B</p>", h("<p>alt</p>"), "16.11. 10:00", 50000, true);
  assert.equal(first.conflict, true);
  assert.equal(first.text, "<p>Gerät A</p><hr><p><em>Auch auf einem anderen Gerät geändert (16.11. 10:00)</em></p><p>Gerät B</p>");
  // B edits its own part again with base = hash of what it sent last
  const again = L.mergeEdit(first.text, "<p>Gerät B, mehr</p>", h("<p>Gerät B</p>"), "16.11. 10:05", 50000, true);
  assert.equal(again.conflict, false);
  assert.match(again.text, /<p>Gerät A<\/p><hr>.*<p>Gerät B, mehr<\/p>$/);
  assert.equal((again.text.match(/anderen Gerät/g) || []).length, 1);
  // fresh base -> plain overwrite
  assert.deepEqual(plain(L.mergeEdit(a, "<p>neu</p>", h(a), "x", 50000, true)), { text: "<p>neu</p>", conflict: false });
});

test("plainToHtml escapes and keeps empty lines", () => {
  assert.equal(L.plainToHtml("a < b & c\n\nzwei"), "<p>a &lt; b &amp; c</p><p></p><p>zwei</p>");
});

test("note validation", () => {
  assert.equal(L.validateNoteAdd({ id: "n1", subject: "physik", title: "Lektion" }).ok, true);
  assert.equal(L.validateNoteAdd({ id: "n1", subject: "physik" }).ok, false);
  assert.equal(L.validateNoteAdd({ id: "n1", subject: "physik", title: "a\nb" }).ok, false);
  assert.equal(L.validateNoteAdd({ id: "n1", subject: "physik", title: "x", html: "x".repeat(45001) }).ok, false);
  assert.equal(L.validateNoteUpdate({ id: "n1", patch: { html: "<p>x</p>" }, base: { html: "0123abcd" } }).ok, true);
  assert.equal(L.validateNoteUpdate({ id: "n1", patch: { subject: "x" } }).ok, false);
  assert.equal(L.validateNoteUpdate({ id: "n1", patch: { html: "" }, base: { html: "zz" } }).ok, false);
});

test("applyNotePatch merges html and trims the title", () => {
  const note = { id: "n1", subject: "physik", title: "Alt", html: "<p>A</p>", createdAt: null, updatedAt: null };
  const r = L.applyNotePatch(note, { id: "n1", patch: { title: "  Neu ", html: "<p>B</p>" }, base: { html: L.textHash("<p>A</p>") } }, "2026-11-16T10:00:00+01:00", "x");
  assert.deepEqual(plain(r), { note: { id: "n1", subject: "physik", title: "Neu", html: "<p>B</p>", createdAt: null, updatedAt: "2026-11-16T10:00:00+01:00" }, conflict: false });
});

test("notesForState: only school subjects, newest first; rows round-trip", () => {
  const rows = [
    ["n1", "physik", "Eins", "<p>1</p>", "2026-11-10T08:00:00+01:00", ""],
    ["n2", "physik", "Zwei", "<p>2</p>", "2026-11-12T08:00:00+01:00", ""],
    ["n3", "privat", "Nein", "", "2026-11-13T08:00:00+01:00", ""],
  ];
  const notes = rows.map(L.rowToNote);
  assert.deepEqual(L.notesForState(notes, cats).map((n) => n.id), ["n2", "n1"]);
  assert.deepEqual(plain(L.noteToRow(notes[0])), rows[0]);
});

test("image validation", () => {
  const ok = { id: "img1", subject: "physik", type: "image/jpeg", data: "QUJD" };
  assert.equal(L.validateImageAdd(ok).ok, true);
  assert.equal(L.validateImageAdd({ ...ok, type: "image/svg+xml" }).ok, false); // never SVG (scripts)
  assert.equal(L.validateImageAdd({ ...ok, data: "<script>" }).ok, false);
  assert.equal(L.validateImageAdd({ ...ok, data: "A".repeat(2800001) }).ok, false);
});

test("event.update validation and time span", () => {
  const ref = { id: "abc@google.com_1763280000000", calendar: "Privat" };
  assert.equal(L.validateEventUpdate({ ...ref, patch: { title: "Neu" } }).ok, true);
  assert.equal(L.validateEventUpdate({ ...ref, patch: { subject: null } }).ok, true);
  assert.equal(L.validateEventUpdate({ ...ref, patch: { subject: "-" } }).ok, true);
  assert.equal(L.validateEventUpdate({ ...ref, patch: { subject: "a b" } }).ok, false);
  assert.equal(L.validateEventUpdate({ ...ref, patch: { start: "10:00" } }).ok, false); // needs date
  assert.equal(L.validateEventUpdate({ ...ref, patch: { date: "2026-11-20", end: "10:00" } }).ok, false);
  assert.equal(L.validateEventUpdate({ ...ref, patch: { allDay: true } }).ok, false);
  assert.equal(L.validateEventUpdate({ id: "no-suffix", calendar: "Privat", patch: { title: "x" } }).ok, false);
  assert.equal(L.validateEventDelete(ref).ok, true);
  assert.equal(L.eventPatchSpan({ title: "x" }), null);
  assert.deepEqual(plain(L.eventPatchSpan({ date: "2026-11-20" })), { allDay: true });
  // winter time: 10:00 Zurich = 09:00Z, default end +60 min
  const span = L.eventPatchSpan({ date: "2026-11-20", start: "10:00" });
  assert.equal(span.start.toISOString(), "2026-11-20T09:00:00.000Z");
  assert.equal(span.end.toISOString(), "2026-11-20T10:00:00.000Z");
  // summer time
  assert.equal(L.eventPatchSpan({ date: "2026-07-01", start: "10:00", end: "11:30" }).end.toISOString(), "2026-07-01T09:30:00.000Z");
});

test("buildState carries notes and hand-picked event subjects", () => {
  const state = L.buildState({
    now: new Date("2026-11-16T07:12:00+01:00"), health: {}, events: [{ id: "k@x_1", title: "Analysis", start: "2026-11-16", end: "2026-11-17", allDay: true }],
    exams: [], todos: [], mails: [], settings: { categories: cats }, subjects: [],
    eventSubjects: { "k@x": "physik" }, notes: [{ id: "n1", subject: "physik", title: "T", html: "", createdAt: null, updatedAt: null }],
  });
  assert.equal(state.events[0].subject, "physik");
  assert.equal(state.notes.length, 1);
});
