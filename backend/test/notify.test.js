// Quiet hours (incl. DST), ntfy body, queue, reminders, briefing text, failure alerts.
const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("./load.js");
const plain = (o) => JSON.parse(JSON.stringify(o));
const CFG = { quietFrom: "22:00", quietTo: "06:30", briefingWeekday: "06:30", briefingWeekend: "09:00" };

test("zurichInstant: normal, DST gap and DST overlap", () => {
  assert.equal(L.toZurichIso(L.zurichInstant("2026-11-16", 390)), "2026-11-16T06:30:00+01:00");
  assert.equal(L.toZurichIso(L.zurichInstant("2026-07-01", 390)), "2026-07-01T06:30:00+02:00");
  // 29.3.2026 02:30 does not exist -> 03:30 CEST
  assert.equal(L.toZurichIso(L.zurichInstant("2026-03-29", 150)), "2026-03-29T03:30:00+02:00");
  // 25.10.2026 02:30 exists twice -> the earlier (CEST)
  assert.equal(L.toZurichIso(L.zurichInstant("2026-10-25", 150)), "2026-10-25T02:30:00+02:00");
});

test("isQuietTime across midnight, winter and summer time", () => {
  const at = (iso) => L.isQuietTime(new Date(iso), CFG.quietFrom, CFG.quietTo);
  assert.equal(at("2026-11-16T21:59:00+01:00"), false);
  assert.equal(at("2026-11-16T22:00:00+01:00"), true);
  assert.equal(at("2026-11-17T03:00:00+01:00"), true);
  assert.equal(at("2026-11-17T06:29:00+01:00"), true);
  assert.equal(at("2026-11-17T06:30:00+01:00"), false);
  // Summer: 20:30 UTC = 22:30 CEST -> quiet; in winter 20:30 UTC = 21:30 CET -> not quiet
  assert.equal(L.isQuietTime(new Date("2026-07-01T20:30:00Z"), "22:00", "06:30"), true);
  assert.equal(L.isQuietTime(new Date("2026-12-01T20:30:00Z"), "22:00", "06:30"), false);
  // Window within one day and disabled window
  assert.equal(L.isQuietTime(new Date("2026-11-16T13:00:00+01:00"), "12:00", "14:00"), true);
  assert.equal(L.isQuietTime(new Date("2026-11-16T13:00:00+01:00"), "", "06:30"), false);
});

test("deliverAfter: held back during quiet hours until quietTo, also over the DST switch", () => {
  const d = (iso, ignore) => L.toZurichIso(L.deliverAfter(new Date(iso), CFG, ignore));
  assert.equal(d("2026-11-16T23:15:00+01:00"), "2026-11-17T06:30:00+01:00");
  assert.equal(d("2026-11-17T02:00:00+01:00"), "2026-11-17T06:30:00+01:00");
  assert.equal(d("2026-11-17T12:00:00+01:00"), "2026-11-17T12:00:00+01:00");
  assert.equal(d("2026-11-16T23:15:00+01:00", true), "2026-11-16T23:15:00+01:00");
  // Night of the switch to summer time and back
  assert.equal(d("2026-03-28T23:00:00+01:00"), "2026-03-29T06:30:00+02:00");
  assert.equal(d("2026-10-24T23:00:00+02:00"), "2026-10-25T06:30:00+01:00");
});

test("ntfy body: JSON fields, priority clamp, 4096-byte limit, https click only", () => {
  const b = plain(L.ntfyBody({ title: "Grüsse\nZeile", body: "ä".repeat(3000), priority: 9, clickUrl: "javascript:x", tag: "mail" }, "topic-x"));
  assert.equal(b.topic, "topic-x");
  assert.equal(b.title, "Grüsse Zeile");
  assert.equal(b.priority, 5);
  assert.ok(L.utf8Length(b.message) <= 4096);
  assert.ok(b.message.endsWith("…"));
  assert.equal(b.click, undefined);
  assert.deepEqual(b.tags, ["mail"]);
  assert.equal(plain(L.ntfyBody({ title: "t", body: "b", priority: 0, clickUrl: "https://mail.google.com/x" }, "t")).click, "https://mail.google.com/x");
  assert.equal(L.ntfyBody({ title: "t", body: "b", priority: 0 }, "t").priority, 3);
  assert.equal(L.truncateUtf8("ab😀cd", 7), "ab…", "never splits a surrogate pair");
  assert.equal(L.truncateUtf8("ab😀cd", 8), "ab😀cd");
});

test("queue: dedupe by key, due split, three attempts then drop", () => {
  const now = new Date("2026-11-16T10:00:00+01:00");
  const a = L.queueItem({ title: "a", body: "", priority: 3 }, now, "mail:1");
  const b = L.queueItem({ title: "b", body: "", priority: 3 }, new Date(now.getTime() + 60000), "mail:2");
  let q = L.enqueue([], [a, b, a]);
  assert.equal(q.length, 2);
  const s = L.dueQueueItems(q, now);
  assert.deepEqual([s.due.length, s.rest.length], [1, 1]);
  let item = s.due[0];
  for (let i = 1; i <= 2; i++) {
    const r = L.afterSendAttempt(item, false);
    assert.equal(r.keep.attempts, i);
    item = r.keep;
  }
  assert.deepEqual(plain(L.afterSendAttempt(item, false)), { keep: null, dropped: true });
  assert.deepEqual(plain(L.afterSendAttempt(item, true)), { keep: null, dropped: false });
  const many = Array.from({ length: 40 }, (_, i) => L.queueItem({ title: String(i) }, now, "k" + i));
  assert.equal(L.enqueue([], many).length, L.NOTIFY_QUEUE_MAX);
});

const todo = (o) => Object.assign({ id: "t", title: "Abgabe", status: "open", dueHasTime: false, priority: 0 }, o);

test("reminders: remindAt, 60 min before a timed due, not twice, not when done, late ones only marked", () => {
  const now = new Date("2026-11-16T13:05:00+01:00");
  const r = plain(L.dueReminders([
    { todo: todo({ id: "a", remindAt: "2026-11-16T13:00:00+01:00" }), remindedAt: "" },
    { todo: todo({ id: "b", due: "2026-11-16T14:00:00+01:00", dueHasTime: true }), remindedAt: "" },
    { todo: todo({ id: "c", due: "2026-11-16T15:00:00+01:00", dueHasTime: true }), remindedAt: "" },
    { todo: todo({ id: "d", remindAt: "2026-11-16T13:00:00+01:00" }), remindedAt: "2026-11-16T13:00:10+01:00" },
    { todo: todo({ id: "e", remindAt: "2026-11-16T13:00:00+01:00", status: "done" }), remindedAt: "" },
    { todo: todo({ id: "f", remindAt: "2026-11-16T05:00:00+01:00" }), remindedAt: "" },
    { todo: todo({ id: "g", due: "2026-11-16" }), remindedAt: "" },
  ], now));
  assert.deepEqual(r.map((x) => [x.id, x.send]), [["a", true], ["b", true], ["f", false]]);
  assert.equal(r[1].msg.body, "Fällig 16.11.2026 um 14:00");
  assert.equal(r[1].msg.title, "Abgabe");
});

test("briefingDue: weekday/weekend time, once per day", () => {
  const due = (iso, sent) => L.briefingDue(new Date(iso), CFG, sent);
  assert.equal(due("2026-11-16T06:29:00+01:00", ""), false); // Monday
  assert.equal(due("2026-11-16T06:30:00+01:00", ""), true);
  assert.equal(due("2026-11-16T07:40:00+01:00", "2026-11-16"), false);
  assert.equal(due("2026-11-21T08:00:00+01:00", ""), false); // Saturday: 09:00
  assert.equal(due("2026-11-21T09:00:00+01:00", "2026-11-20"), true);
  assert.equal(L.briefingTitle("2026-11-21"), "Briefing Samstag, 21.11.");
});

test("briefing text: first lecture with room, counts, exams, important mails", () => {
  const now = new Date("2026-11-16T06:30:00+01:00");
  const text = L.buildBriefingText({
    now,
    events: [
      { kind: "lecture", title: "Analysis", start: "2026-11-16T12:30:00+01:00", end: "2026-11-16T14:55:00+01:00", allDay: false, location: "B12" },
      { kind: "lecture", title: "Mathematik", start: "2026-11-16T08:30:00+01:00", end: "2026-11-16T10:55:00+01:00", allDay: false, location: "A101" },
      { kind: "private", title: "Training", start: "2026-11-16T19:00:00+01:00", end: "2026-11-16T20:00:00+01:00", allDay: false },
      { kind: "private", title: "Morgen", start: "2026-11-17T19:00:00+01:00", end: "2026-11-17T20:00:00+01:00", allDay: false },
    ],
    todos: [
      todo({ id: "1", due: "2026-11-16" }),
      todo({ id: "2", due: "2026-11-16T17:00:00+01:00", dueHasTime: true }),
      todo({ id: "3", due: "2026-11-12" }),
      todo({ id: "4", due: "2026-11-12", status: "done" }),
      todo({ id: "5", due: "2026-11-20" }),
    ],
    exams: [
      { kind: "exam", title: "Prüfung Physik", start: "2026-11-21", end: "2026-11-22", allDay: true },
      { kind: "deadline", title: "Abgabe Bericht", start: "2026-11-17", end: "2026-11-18", allDay: true },
      { kind: "exam", title: "Zu weit", start: "2026-12-15", end: "2026-12-16", allDay: true },
    ],
    mails: [
      { importance: 3, receivedAt: "2026-11-15T09:00:00+01:00" },
      { importance: 2, receivedAt: "2026-11-16T05:00:00+01:00" },
      { importance: 1, receivedAt: "2026-11-16T05:00:00+01:00" },
      { importance: 3, receivedAt: "2026-11-14T09:00:00+01:00" },
    ],
  });
  assert.equal(
    text,
    [
      "Heute 3 Termine. Erste Lektion 08:30 Mathematik (A101).",
      "To-dos: 2 heute fällig, 1 überfällig.",
      "Prüfungen/Abgaben: Abgabe Bericht morgen, Prüfung Physik in 5 Tagen.",
      "2 wichtige Mails seit gestern.",
    ].join("\n")
  );
  assert.ok(!text.includes("ß"));
});

test("briefing text: quiet day", () => {
  const text = L.buildBriefingText({ now: new Date("2026-11-21T09:00:00+01:00"), events: [], todos: [], exams: [], mails: [] });
  assert.equal(text, "Heute keine Termine.\nKeine To-dos fällig.");
  const one = L.buildBriefingText({
    now: new Date("2026-11-21T09:00:00+01:00"),
    events: [{ kind: "private", title: "Ausflug", start: "2026-11-21", end: "2026-11-22", allDay: true }],
    todos: [], exams: [], mails: [{ importance: 2, receivedAt: "2026-11-21T08:00:00+01:00" }],
  });
  assert.equal(one, "Heute 1 Termin, keine Lektionen.\nKeine To-dos fällig.\n1 wichtige Mail seit gestern.");
});

test("failure alert after 3 failed ticks in a row, at most once per 6 h", () => {
  const h = 3600 * 1000;
  assert.deepEqual(plain(L.failureTracking(0, false, 0, 10 * h)), { fails: 1, alert: false });
  assert.deepEqual(plain(L.failureTracking(2, false, 0, 10 * h)), { fails: 3, alert: true });
  assert.deepEqual(plain(L.failureTracking(3, false, 8 * h, 10 * h)), { fails: 4, alert: false });
  assert.deepEqual(plain(L.failureTracking(9, false, 3 * h, 10 * h)), { fails: 10, alert: true });
  assert.deepEqual(plain(L.failureTracking(9, true, 3 * h, 10 * h)), { fails: 0, alert: false });
});
