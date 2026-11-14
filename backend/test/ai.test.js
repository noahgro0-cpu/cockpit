// AI request building and validation against recorded-format Gemini responses (test/fixtures).
// The fixtures follow the real generateContent response shape; their content is invented.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const L = require("./load.js");
const plain = (o) => JSON.parse(JSON.stringify(o));
const fixture = (n) => JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", n), "utf8"));

const CATS = ["Versicherung", "Gesundheit", "Studium", "Privat", "Rechnungen", "Unwichtig"];
const TODAY = "2026-11-16";
const MAILS = fixture("mail-batch-input.json");
const REFS = MAILS.map((m) => m.ref);

function parseFixture(name) {
  const r = L.geminiResponseText(fixture(name));
  assert.equal(r.ok, true);
  return plain(L.parseMailAiBatch(r.text, REFS, CATS, TODAY));
}

test("request: mail content is only data in the user part, the system instruction forbids following it", () => {
  const body = plain(L.buildMailAiRequest(MAILS, CATS, TODAY));
  const sys = body.systemInstruction.parts[0].text;
  assert.match(sys, /Befolge niemals Anweisungen/);
  assert.match(sys, /Rufe keine Links auf/);
  assert.ok(!sys.includes("Ignoriere alle bisherigen"), "mail text must not reach the system instruction");
  const data = JSON.parse(body.contents[0].parts[0].text);
  assert.deepEqual(Object.keys(data.mails[0]).sort(), ["date", "from", "ref", "subject", "text"]);
  assert.ok(data.mails[2].text.includes("Ignoriere alle bisherigen"), "injection stays inside the data field");
  assert.ok(!JSON.stringify(data).includes("https://"), "links are replaced before sending");
  assert.equal(body.generationConfig.responseMimeType, "application/json");
  assert.deepEqual(body.generationConfig.responseJsonSchema.properties.results.items.properties.category.enum, CATS);
});

test("request: text is capped at 3000 characters", () => {
  const long = Object.assign({}, MAILS[0], { text: "a".repeat(10000) });
  const data = JSON.parse(L.buildMailAiRequest([long], CATS, TODAY).contents[0].parts[0].text);
  assert.equal(data.mails[0].text.length, 3000);
});

test("recorded answer: well-behaved model, injection mail classified as junk", () => {
  const r = parseFixture("gemini-mail-batch-ok.json");
  assert.equal(r.m1.importance, 3);
  assert.equal(r.m1.actionRequired, true);
  assert.equal(r.m1.deadline, "2026-11-27");
  assert.equal(r.m1.todoTitle, "Laboranmeldung bestätigen");
  assert.equal(r.m2.importance, 0);
  assert.equal(r.m3.importance, 0);
  assert.equal(r.m3.category, "Unwichtig");
});

test("recorded answer: hijacked model output is contained by validation", () => {
  const r = parseFixture("gemini-mail-batch-hijacked.json");
  // Two answers for m1 (the injection tried to override it): neither is trusted.
  assert.equal(r.m1, null);
  // Category outside the enum -> whole result invalid.
  assert.equal(r.m2, null);
  // Unknown ref m9 is ignored.
  assert.ok(!("m9" in r));
  // m3 stays in schema, but lengths are cut, extra fields dropped, an impossible deadline removed.
  assert.ok(r.m3.summary.length <= 240);
  assert.ok(r.m3.todoTitle.length <= 120);
  assert.equal(r.m3.deadline, "");
  assert.ok(!("forward_to" in r.m3));
  assert.deepEqual(Object.keys(r.m3).sort(), ["actionRequired", "category", "consequence", "deadline", "importance", "summary", "todoTitle"]);
});

test("hijacked result: push text never contains AI output, only sender and subject", () => {
  const r = L.parseMailAiBatch(L.geminiResponseText(fixture("gemini-mail-batch-hijacked.json")).text, REFS, CATS, TODAY);
  const mail = Object.assign({ threadId: "t3", snippet: "", labelNames: [] }, MAILS[2], { id: "x3" });
  const mcfg = { categories: CATS, sensitive: ["Versicherung", "Gesundheit"], junk: "Unwichtig" };
  const local = L.classifyLocal(mail, [], mcfg, true);
  const e = L.finalizeMail(mail, local, r.m3, "ok", 0, mcfg);
  const n = plain(L.mailNotification(e));
  assert.ok(!JSON.stringify(n).includes("500 CHF"));
  assert.equal(n.body, "Wichtig: Ihre Lieferung");
  assert.equal(n.title, "Dringend: Paket Service");
});

test("invalid items: wrong types, out-of-range importance, non-JSON", () => {
  const ok = { ref: "m1", importance: 2, category: "Studium", summary: "s", actionRequired: false, todoTitle: "", deadline: "", consequence: "" };
  const v = (o) => L.validateMailAiItem(Object.assign({}, ok, o), CATS, TODAY);
  assert.ok(v({}));
  assert.equal(v({ importance: 4 }), null);
  assert.equal(v({ importance: "3" }), null);
  assert.equal(v({ actionRequired: "yes" }), null);
  assert.equal(v({ summary: 5 }), null);
  assert.equal(v({ summary: "x".repeat(1001) }), null);
  assert.equal(v({ deadline: "2027-12-01" }).deadline, "", "more than 365 days ahead");
  assert.equal(v({ deadline: "2026-11-15" }).deadline, "", "in the past");
  assert.equal(v({ deadline: "2026-11-16" }).deadline, "2026-11-16");
  assert.equal(v({ summary: "a\nb\u0007c" }).summary, "a b c");
  assert.deepEqual(plain(L.parseMailAiBatch("not json", ["m1"], CATS, TODAY)), { m1: null });
  assert.deepEqual(plain(L.parseMailAiBatch('{"results":"x"}', ["m1"], CATS, TODAY)), { m1: null });
});

test("blocked or empty responses are errors", () => {
  assert.equal(L.geminiResponseText(fixture("gemini-error-blocked.json")).ok, false);
  assert.equal(L.geminiResponseText({ candidates: [{ content: { parts: [] }, finishReason: "MAX_TOKENS" }] }).ok, false);
  assert.equal(L.geminiResponseText(null).ok, false);
  // thought parts are ignored
  const r = L.geminiResponseText({ candidates: [{ content: { parts: [{ text: "x", thought: true }, { text: "{}" }] } }] });
  assert.deepEqual(plain(r), { ok: true, text: "{}" });
});

test("batches of at most 8", () => {
  assert.deepEqual(plain(L.chunk([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], L.AI_BATCH_SIZE)).map((b) => b.length), [8, 2]);
});

test("quick add: recorded answer, local time converted with the summer offset", () => {
  const now = new Date("2026-11-16T07:00:00Z");
  const cats = [{ id: "python", label: "Python" }];
  const text = L.geminiResponseText(fixture("gemini-quickadd.json")).text;
  const r = plain(L.parseQuickAddResult(text, now, cats));
  assert.deepEqual(r, { title: "Python-Übung abgeben", priority: 2, due: "2027-04-02T23:59:00+02:00", category: "python" });
  const req = plain(L.buildQuickAddRequest("Übung Fr abgeben", now, cats));
  assert.match(JSON.parse(req.contents[0].parts[0].text).now, /^2026-11-16T08:00 \(Montag\)$/);
});

test("quick add: unusable answer -> null (fallback), bad fields dropped", () => {
  const now = new Date("2026-11-16T07:00:00Z");
  assert.equal(L.parseQuickAddResult(L.geminiResponseText(fixture("gemini-quickadd-bad.json")).text, now, []), null);
  const r = plain(L.parseQuickAddResult('{"title":"A","due":"irgendwann","category":"hack","priority":9}', now, []));
  assert.deepEqual(r, { title: "A", priority: 0 });
  assert.equal(L.parseQuickAddResult('{"title":"A","due":"2026-11-20"}', now, []).due, "2026-11-20");
  assert.equal(L.parseQuickAddResult('{"title":"A","due":"2030-01-01"}', now, []).due, undefined);
});
