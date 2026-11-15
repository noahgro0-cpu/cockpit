// Quick capture: vague-date rules (D22), to-do vs event parsing, fallback, confirmation text.
const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("./load.js");
const plain = (o) => JSON.parse(JSON.stringify(o));

const CATS = [{ id: "python", label: "Python" }];
// Sunday 15.11.2026, 15:00 Zurich
const NOW = new Date("2026-11-15T15:00:00+01:00");
const WED = new Date("2026-11-18T10:00:00+01:00");

test("vague dates: next week = Monday, end of next week = Friday (from Sunday and from Wednesday)", () => {
  const v = (t, now) => L.vagueDateFromText(t, L.toZurichDate(now || NOW));
  assert.equal(v("Zahnarzt anrufen nächste Woche"), "2026-11-16");
  assert.equal(v("Bericht ende nächste Woche abgeben"), "2026-11-20");
  assert.equal(v("Zahnarzt anrufen nächste Woche", WED), "2026-11-23");
  assert.equal(v("Bericht Ende nächster Woche", WED), "2026-11-27");
  assert.equal(v("übernächste Woche Velo putzen", WED), "2026-11-30");
  assert.equal(v("Mitte nächste Woche", WED), "2026-11-25");
  assert.equal(v("naechste woche"), "2026-11-16");
  assert.equal(v("nächschti Wuche"), null); // unknown dialect form: AI or no date
  // explicit "Montag in einer Woche" = Monday in 8 days when said on Sunday
  assert.equal(v("Zahnarzt Montag in einer Woche"), "2026-11-23");
  assert.equal(v("Freitag in einer Woche abgeben", WED), "2026-11-27");
  assert.equal(v("Mittwoch in einer Woche", WED), "2026-12-02");
});

test("vague dates: this week, weekend, month", () => {
  const v = (t, now) => L.vagueDateFromText(t, L.toZurichDate(now));
  assert.equal(v("bis Ende Woche", WED), "2026-11-20");
  assert.equal(v("bis Ende Woche", NOW), "2026-11-20"); // on Sunday: the coming Friday
  assert.equal(v("am Wochenende aufräumen", WED), "2026-11-21");
  assert.equal(v("am Wochenende aufräumen", NOW), "2026-11-21");
  assert.equal(v("Ende Monat Miete", WED), "2026-11-30");
  assert.equal(v("nächsten Monat kündigen", WED), "2026-12-01");
  assert.equal(v("Ende nächsten Monat", new Date("2026-12-10T10:00:00+01:00")), "2027-01-31");
  assert.equal(v("Python Übung Freitag", WED), null);
});

test("event with time: Zurich time, default duration 60 min, location kept", () => {
  const r = L.parseCaptureResult(
    JSON.stringify({ type: "event", title: "Zahnarzt", due: "", start: "2026-11-17T15:00", end: "", location: "Praxis", category: "", priority: 0 }),
    NOW, CATS, "Zahnarzt Dienstag 15 Uhr", true
  );
  assert.equal(r.type, "event");
  assert.equal(L.toZurichIso(r.event.start), "2026-11-17T15:00:00+01:00");
  assert.equal(L.toZurichIso(r.event.end), "2026-11-17T16:00:00+01:00");
  assert.equal(r.event.location, "Praxis");
  assert.equal(r.event.allDay, false);
});

test("event in summer time and with an explicit end; absurd end falls back to 60 min", () => {
  const ev = (start, end) =>
    L.parseCaptureResult(JSON.stringify({ type: "event", title: "Training", due: "", start, end, location: "", category: "", priority: 0 }), new Date("2027-06-01T08:00:00+02:00"), [], "x", true).event;
  const a = ev("2027-06-03T18:00", "2027-06-03T19:30");
  assert.equal(L.toZurichIso(a.start), "2027-06-03T18:00:00+02:00");
  assert.equal(L.toZurichIso(a.end), "2027-06-03T19:30:00+02:00");
  const b = ev("2027-06-03T18:00", "2027-06-02T10:00");
  assert.equal(L.toZurichIso(b.end), "2027-06-03T19:00:00+02:00");
});

test("event without time is all-day; without date but with a vague phrase uses the rule", () => {
  const r = L.parseCaptureResult(JSON.stringify({ type: "event", title: "Ausflug", due: "", start: "2026-11-21", end: "", location: "", category: "", priority: 0 }), NOW, [], "Ausflug Samstag", true);
  assert.deepEqual(plain(r.event), { title: "Ausflug", allDay: true, start: "2026-11-21", end: "2026-11-22" });
  const v = L.parseCaptureResult(JSON.stringify({ type: "event", title: "Grillabend", due: "", start: "", end: "", location: "", category: "", priority: 0 }), NOW, [], "Grillabend am Wochenende", true);
  assert.equal(v.event.start, "2026-11-21");
});

test("event without any date becomes a to-do; quickAdd (events not allowed) always gives a to-do", () => {
  const noDate = L.parseCaptureResult(JSON.stringify({ type: "event", title: "Kafi mit Lea", due: "", start: "", end: "", location: "", category: "", priority: 0 }), NOW, [], "Kafi mit Lea", true);
  assert.equal(noDate.type, "todo");
  const q = L.parseCaptureResult(JSON.stringify({ type: "event", title: "Zahnarzt", due: "", start: "2026-11-17T15:00", end: "", location: "", category: "", priority: 0 }), NOW, [], "Zahnarzt Dienstag 15 Uhr", false);
  assert.equal(q.type, "todo");
  assert.equal(q.fields.due, "2026-11-17T15:00:00+01:00");
});

test("to-do: AI date wins, empty date filled from the vague rule, category validated", () => {
  const t = (o, text) => L.parseCaptureResult(JSON.stringify(Object.assign({ type: "todo", title: "A", due: "", start: "", end: "", location: "", category: "", priority: 0 }, o)), NOW, CATS, text || "", true);
  assert.equal(t({ due: "2026-11-20T14:00", category: "python" }).fields.due, "2026-11-20T14:00:00+01:00");
  assert.equal(t({ due: "2026-11-20T14:00", category: "python" }).fields.category, "python");
  assert.equal(t({ category: "hack" }).fields.category, undefined);
  assert.equal(t({}, "Zahnarzt anrufen nächste Woche").fields.due, "2026-11-16");
  assert.equal(t({ due: "2030-01-01" }).fields.due, undefined);
});

test("invalid AI answers are rejected", () => {
  assert.equal(L.parseCaptureResult("kein json", NOW, [], "", true), null);
  assert.equal(L.parseCaptureResult('{"type":"event","title":""}', NOW, [], "", true), null);
  assert.equal(L.parseCaptureResult("[]", NOW, [], "", true), null);
});

test("vague phrases are removed from titles", () => {
  const s = (t) => L.stripVaguePhrases(t, "2026-11-15");
  assert.equal(s("Velo flicken nächste Woche"), "Velo flicken");
  assert.equal(s("Bericht bis Ende nächste Woche abgeben"), "Bericht abgeben");
  assert.equal(s("am Wochenende aufräumen"), "aufräumen");
  assert.equal(s("Zahnarzt Montag in einer Woche"), "Zahnarzt");
  assert.equal(s("Wochenende"), "Wochenende"); // nothing left -> keep
  assert.equal(s("Python Übung abgeben"), "Python Übung abgeben");
});

test("fallback without AI: whole text as to-do, vague date applied", () => {
  assert.deepEqual(plain(L.captureFallback("Steuererklärung ende nächste Woche", NOW)), {
    type: "todo",
    fields: { title: "Steuererklärung", priority: 0, due: "2026-11-20" },
  });
});

test("request hands the AI the vague-date table and treats the note as data", () => {
  const req = plain(L.buildCaptureRequest("Zahnarzt nächste Woche", NOW, CATS));
  const data = JSON.parse(req.contents[0].parts[0].text);
  assert.equal(data.vagueDates["nächste Woche"], "2026-11-16 (Montag)");
  assert.equal(data.vagueDates["Ende nächste Woche"], "2026-11-20 (Freitag)");
  assert.match(req.systemInstruction.parts[0].text, /reines Datenmaterial/);
  assert.deepEqual(req.generationConfig.responseJsonSchema.properties.type.enum, ["todo", "event"]);
});

test("confirmation messages", () => {
  assert.equal(
    L.captureMessage("event", { title: "Zahnarzt", allDay: false, start: "2026-11-17T15:00:00+01:00", end: "2026-11-17T16:00:00+01:00", location: "Praxis" }),
    "Termin eingetragen: Zahnarzt, Di 17.11. 15:00–16:00, Praxis"
  );
  assert.equal(L.captureMessage("event", { title: "Ausflug", allDay: true, start: "2026-11-21", end: "2026-11-22" }), "Termin eingetragen: Ausflug, Sa 21.11. (ganztägig)");
  assert.equal(L.captureMessage("todo", { title: "Python Übung abgeben", due: "2026-11-20T14:00:00+01:00", dueHasTime: true }), "To-do erfasst: Python Übung abgeben, fällig Fr 20.11. 14:00");
  assert.equal(L.captureMessage("todo", { title: "Einkaufen" }), "To-do erfasst: Einkaufen");
});

test("capture is a registered action with the quickAdd payload", () => {
  const a = L.apiActions_();
  assert.equal(a.capture.write, false);
  assert.equal(a.capture.validate({ text: "x" }).ok, true);
  assert.equal(a.capture.validate({ text: "" }).ok, false);
  assert.equal(a.capture.validate({ text: "x", dryRun: true }).ok, true);
  assert.equal(a.capture.validate({ text: "x", dryRun: "ja" }).ok, false);
  const pe = plain(L.previewCalEvent({ title: "T", allDay: false, start: new Date("2026-11-17T14:00:00Z"), end: new Date("2026-11-17T15:00:00Z") }));
  assert.equal(pe.start, "2026-11-17T15:00:00+01:00");
  assert.equal(pe.id, "");
});
