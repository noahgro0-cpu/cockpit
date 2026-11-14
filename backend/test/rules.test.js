const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("./load.js");
const plain = (o) => JSON.parse(JSON.stringify(o));

const MCFG = { categories: ["Versicherung", "Gesundheit", "Studium", "Privat", "Unwichtig"], sensitive: ["Versicherung", "Gesundheit"], junk: "Unwichtig" };
const ROWS = [
  ["ja", "from", "hochschule.example", 2, "Studium", "nein", "nein", ""],
  ["ja", "from", "kasse.example", 2, "Gesundheit", "ja", "ja", ""],
  ["nein", "from", "disabled.example", 3, "", "", "", "inactive"],
  ["", "subject", "/rechnung\\s+nr/", "", "", "", "", "regex, no fixed importance"],
  ["ja", "from", "newsletter", 0, "Unwichtig", "nein", "nein", ""],
  ["ja", "subject", "/krankenkasse|arztbericht/", "", "Gesundheit", "ja", "", "keyword"],
  ["ja", "from", "/[/", 1, "", "", "", "broken regex"],
  ["ja", "body", "x", 1, "", "", "", "bad field"],
];
const mail = (o) => Object.assign({ fromName: "", fromEmail: "", subject: "", labelNames: [] }, o);

test("parseRules: inactive, broken and invalid rows are skipped and reported", () => {
  const { rules, errors } = L.parseRules(ROWS);
  assert.equal(rules.length, 5);
  assert.deepEqual(plain(errors), ["rule row 8: invalid regex", "rule row 9: feld must be from or subject"]);
  assert.equal(rules[2].importance, null, "empty importance = not fixed");
  assert.equal(rules[2].row, 5);
});

test("matchRule: first hit wins, substring case-insensitive, regex", () => {
  const { rules } = L.parseRules(ROWS);
  assert.equal(L.matchRule(rules, mail({ fromEmail: "info@HOCHSCHULE.example" })).row, 2);
  assert.equal(L.matchRule(rules, mail({ subject: "Rechnungsnr. 5" })), null, "regex needs whitespace before 'nr'");
  assert.equal(L.matchRule(rules, mail({ subject: "Ihre Rechnung Nr 5" })).row, 5);
  assert.equal(L.matchRule(rules, mail({ fromName: "Newsletter Team", fromEmail: "a@b.example" })).row, 6);
  assert.equal(L.matchRule(rules, mail({ fromEmail: "x@disabled.example" })), null);
  // noreply senders are not devalued by any default rule
  assert.equal(L.matchRule(rules, mail({ fromEmail: "noreply@shop.example" })), null);
});

test("classifyLocal: sensitive and fixed-importance mails never go to the AI", () => {
  const { rules } = L.parseRules(ROWS);
  const s = L.classifyLocal(mail({ fromEmail: "service@kasse.example" }), rules, MCFG, true);
  assert.deepEqual([s.sensitive, s.toAi, s.importance, s.push, s.category], [true, false, 2, true, "Gesundheit"]);
  const k = L.classifyLocal(mail({ subject: "Ihr Arztbericht" }), rules, MCFG, true);
  assert.deepEqual([k.sensitive, k.toAi, k.importance], [true, false, 2]);
  const f = L.classifyLocal(mail({ fromEmail: "a@hochschule.example" }), rules, MCFG, true);
  assert.deepEqual([f.sensitive, f.toAi, f.importance, f.category], [false, false, 2, "Studium"]);
  const n = L.classifyLocal(mail({ fromEmail: "x@other.example" }), rules, MCFG, true);
  assert.deepEqual([n.toAi, n.importance], [true, null]);
  const off = L.classifyLocal(mail({ fromEmail: "x@other.example" }), rules, MCFG, false);
  assert.equal(off.toAi, false, "without AI everything stays rule based");
});

test("classifyLocal: the user's own Gmail labels set category and sensitivity", () => {
  const s = L.classifyLocal(mail({ fromEmail: "x@other.example", labelNames: ["Privat", "Versicherung"] }), [], MCFG, true);
  assert.deepEqual([s.sensitive, s.toAi, s.category], [true, false, "Versicherung"]);
  const p = L.classifyLocal(mail({ fromEmail: "x@other.example", labelNames: ["Privat"] }), [], MCFG, true);
  assert.deepEqual([p.sensitive, p.toAi, p.category], [false, true, "Privat"]);
});

test("isSensitiveText uses sensitive subject rules (quick add)", () => {
  const { rules } = L.parseRules(ROWS);
  assert.equal(L.isSensitiveText("Krankenkasse anrufen morgen", rules), true);
  assert.equal(L.isSensitiveText("Python Übung", rules), false);
});

test("mailConfig: parses JSON lists, adds sensitive and junk categories to the enum", () => {
  const c = plain(L.mailConfig({ mailCategories: '["Studium"]', sensitiveCategories: '["Gesundheit"]', junkCategory: "Unwichtig" }));
  assert.deepEqual(c, { categories: ["Studium", "Gesundheit", "Unwichtig"], sensitive: ["Gesundheit"], junk: "Unwichtig" });
  assert.deepEqual(plain(L.mailConfig({ mailCategories: "kaputt" })).categories, []);
});

test("feedbackRule: new sender rule, or update of the existing one (idempotent)", () => {
  const m = { fromEmail: "Info@Shop.example", category: "Privat", sensitive: false };
  const a = plain(L.feedbackRule(m, "unwichtig", ROWS, MCFG, "2026-11-16"));
  assert.equal(a.matchIndex, -1);
  assert.deepEqual(a.row, ["ja", "from", "info@shop.example", 0, "Unwichtig", "nein", "nein", "Feedback 2026-11-16"]);
  const b = plain(L.feedbackRule(m, "wichtig", ROWS.concat([a.row]), MCFG, "2026-11-16"));
  assert.equal(b.matchIndex, ROWS.length);
  assert.deepEqual(b.row.slice(3, 5), [2, "Privat"]);
  const s = plain(L.feedbackRule({ fromEmail: "a@kasse.example", category: "Gesundheit", sensitive: true }, "wichtig", [], MCFG, "2026-11-16"));
  assert.equal(s.row[5], "ja", "sensitive stays sensitive");
});
