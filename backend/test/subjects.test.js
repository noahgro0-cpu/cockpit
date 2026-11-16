// Subjects (D27): keywords, links, conflict-safe notes, event assignment. All data invented.
const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("./load.js");
const plain = (o) => JSON.parse(JSON.stringify(o));

const CATS = [
  { id: "ana", label: "Analysis", color: "#BFD7EA", group: "schule" },
  { id: "efp", label: "EFP", color: "#AED9E0", group: "schule" },
  { id: "privat", label: "Privat", color: "#E8E2C8", group: "privat" },
];
const REC = (id, keywords) => ({ id, keywords, info: "", links: [], notes: "", updatedAt: null });

test("matchSubject: keyword at a word start, label as default, longest wins", () => {
  const m = L.subjectMatchers(CATS, [REC("efp", ["Energie", "Fluid", "EFP"])]);
  assert.equal(L.matchSubject("Analysis Vorlesung", m), "ana");
  assert.equal(L.matchSubject("Labor Fluid", m), "efp");
  assert.equal(L.matchSubject("Energien, Fluide & Prozesse", m), "efp");
  assert.equal(L.matchSubject("Training", m), "");
  assert.equal(L.matchSubject("Psychoanalysis-Kurs", m), ""); // not at a word start
  assert.equal(L.matchSubject("Prüfung (Analysis)", m), "ana");
  const m2 = L.subjectMatchers(CATS, [REC("ana", ["Mathe"]), REC("efp", ["Mathematik 1B"])]);
  assert.equal(L.matchSubject("Mathematik 1B Übung", m2), "efp");
  assert.equal(L.matchSubject("privat", m), ""); // non-school categories never match
});

test("subjectsForState: one per school category, merged with records", () => {
  const s = L.subjectsForState(CATS, [REC("efp", ["EFP"]), REC("unknown", [])]);
  assert.deepEqual(plain(s.map((x) => [x.id, x.keywords])), [["ana", []], ["efp", ["EFP"]]]);
  assert.equal(s[0].updatedAt, null);
});

test("links: sheet lines 'Label | url', invalid lines skipped, round trip", () => {
  const links = L.parseLinks("ILIAS | https://lms.example/kurs\nhttps://www.example.org/x\njavascript:alert(1)\nSkript | ftp://x");
  assert.deepEqual(plain(links), [
    { label: "ILIAS", url: "https://lms.example/kurs" },
    { label: "example.org", url: "https://www.example.org/x" },
  ]);
  assert.deepEqual(plain(L.parseLinks(L.linksToCell(links))), plain(links));
});

test("record row round trip keeps text that looks like a formula or date", () => {
  const rec = { id: "ana", keywords: ["Ana", "Mathe"], info: "=SUM(A1)", links: [{ label: "A|B", url: "https://x.example" }], notes: "- 2026-11-20\n+41 …", updatedAt: "2026-11-16T08:00:00+01:00" };
  const back = L.rowToSubjectRecord(L.subjectRecordToRow(rec));
  assert.equal(back.info, "=SUM(A1)");
  assert.equal(back.notes, "- 2026-11-20\n+41 …");
  assert.deepEqual(plain(back.keywords), ["Ana", "Mathe"]);
  assert.equal(back.links[0].label, "A/B");
});

test("validateSubjectUpdate: limits, URL schemes, base hashes", () => {
  const ok = (p) => L.validateSubjectUpdate(p).ok;
  assert.ok(ok({ id: "ana", patch: { notes: "x" }, base: { notes: L.textHash("") } }));
  assert.ok(!ok({ id: "ana", patch: {} }));
  assert.ok(!ok({ id: "ana", patch: { color: "#fff" } }));
  assert.ok(!ok({ id: "ana", patch: { notes: "x".repeat(20001) } }));
  assert.ok(!ok({ id: "ana", patch: { links: [{ label: "x", url: "javascript:alert(1)" }] } }));
  assert.ok(ok({ id: "ana", patch: { links: [{ label: "", url: "https://lms.example" }] } }));
  assert.ok(!ok({ id: "ana", patch: { keywords: ["a,b"] } }));
  assert.ok(!ok({ id: "ana", patch: { notes: "x" }, base: { notes: "nothex!!" } }));
  assert.ok(!ok({ id: "../x", patch: { notes: "x" } }));
});

test("applySubjectPatch: sequential saves apply, a concurrent edit keeps both versions", () => {
  const p1 = { id: "ana", patch: { notes: "A" }, base: { notes: L.textHash("") } };
  const r1 = L.applySubjectPatch(null, p1, "T1", "16.11. 08:00");
  assert.equal(r1.record.notes, "A");
  assert.equal(r1.conflict, false);
  // Same device, next autosave: based on "A".
  const r2 = L.applySubjectPatch(r1.record, { id: "ana", patch: { notes: "AB" }, base: { notes: L.textHash("A") } }, "T2", "x");
  assert.equal(r2.record.notes, "AB");
  // Other device still based on "A": both versions are kept.
  const r3 = L.applySubjectPatch(r2.record, { id: "ana", patch: { notes: "AC" }, base: { notes: L.textHash("A") } }, "T3", "16.11. 09:00");
  assert.equal(r3.conflict, true);
  assert.match(r3.record.notes, /^AB\n\n--- Auch auf einem anderen Gerät geändert \(16\.11\. 09:00\) ---\nAC$/);
  // A retry of an already applied save is not a conflict.
  const r4 = L.applySubjectPatch(r2.record, { id: "ana", patch: { notes: "AB" }, base: { notes: L.textHash("A") } }, "T4", "x");
  assert.equal(r4.conflict, false);
  assert.equal(r4.record.updatedAt, "T4");
});

test("textHash is stable (same values as web/src/subjectData.ts)", () => {
  assert.equal(L.textHash(""), "811c9dc5");
  assert.equal(L.textHash("Notiz äöü"), L.textHash("Notiz äöü"));
  assert.notEqual(L.textHash("a"), L.textHash("b"));
  assert.equal(L.textHash("abc"), "1a47e90b");
});

test("assignEventSubjects: valid tag wins, else keywords; unknown tags dropped", () => {
  const m = L.subjectMatchers(CATS, []);
  const out = L.assignEventSubjects([
    { id: "1", title: "Treffen", subject: "efp" },
    { id: "2", title: "Analysis" },
    { id: "3", title: "Analysis", subject: "privat" },
    { id: "4", title: "Kino" },
  ], m);
  assert.deepEqual(out.map((e) => e.subject), ["efp", "ana", "ana", undefined]);
});

test("event.add: exams all-day; default calendar timed with +60 min default", () => {
  const v = (p) => L.validateEventAdd(p);
  assert.ok(v({ calendar: "exams", title: "Prüfung", date: "2026-12-02", kind: "exam", subject: "ana" }).ok);
  assert.ok(!v({ calendar: "exams", title: "Prüfung", date: "2026-12-02", kind: "exam", start: "08:00" }).ok);
  assert.ok(!v({ calendar: "default", title: "x", date: "2026-12-02", end: "09:00" }).ok);
  assert.ok(!v({ calendar: "other", title: "x", date: "2026-12-02" }).ok);
  assert.ok(v({ calendar: "default", title: "Lerngruppe", date: "2026-12-02" }).ok);
  const span = L.eventAddSpan({ calendar: "default", title: "x", date: "2026-03-29", start: "09:00" });
  assert.equal(span.allDay, false);
  assert.equal(L.toZurichIso(span.start), "2026-03-29T09:00:00+02:00"); // summer time
  assert.equal(span.end - span.start, 3600000);
  const back = L.eventAddSpan({ calendar: "default", title: "x", date: "2026-11-16", start: "10:00", end: "09:00" });
  assert.equal(back.end - back.start, 3600000);
  assert.equal(L.eventAddSpan({ calendar: "default", title: "x", date: "2026-11-16" }).allDay, true);
});

test("mail to-do gets its subject from keywords, sensitive mails never", () => {
  const m = L.subjectMatchers(CATS, []);
  const mail = { id: "m1", subject: "Analysis: Serie 8", importance: 2, sensitive: false, category: "Schule" };
  assert.equal(L.todoFromMail(mail, "t1", "2026-11-16T08:00:00+01:00", "Serie lösen", m).category, "ana");
  assert.equal(L.todoFromMail(Object.assign({}, mail, { sensitive: true }), "t2", "2026-11-16T08:00:00+01:00", "", m).category, undefined);
});
