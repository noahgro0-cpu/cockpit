// Mail parsing, final classification, to-do/push planning and the observe-mode guarantee.
const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("./load.js");
const plain = (o) => JSON.parse(JSON.stringify(o));

const MCFG = { categories: ["Versicherung", "Gesundheit", "Studium", "Privat", "Unwichtig"], sensitive: ["Versicherung", "Gesundheit"], junk: "Unwichtig" };
const b64 = (s) => Buffer.from(s, "utf8").toString("base64url");
const decode = (data, charset) => Buffer.from(data, "base64url").toString(charset === "ISO-8859-1" ? "latin1" : "utf8");

function gmailMsg(over) {
  return Object.assign({
    id: "18c0aa", threadId: "18c0a0", internalDate: String(Date.parse("2026-11-16T09:12:00+01:00")),
    labelIds: ["INBOX", "UNREAD", "Label_7"], snippet: "Bitte best&auml;tigen Sie Ihre Anmeldung",
    payload: {
      mimeType: "multipart/alternative",
      headers: [{ name: "From", value: '"Studiensekretariat" <Sekretariat@Hochschule.example>' }, { name: "Subject", value: "Anmeldung Labor – Frist" }],
      parts: [
        { mimeType: "text/plain", headers: [{ name: "Content-Type", value: 'text/plain; charset="UTF-8"' }], body: { data: b64("Bitte bestätigen Sie bis 27.11.\nhttps://x.example/a?b=c\n\n\n\nGruss") } },
        { mimeType: "text/html", headers: [], body: { data: b64("<p>HTML</p>") } },
        { mimeType: "application/pdf", filename: "a.pdf", headers: [], body: { attachmentId: "x" } },
      ],
    },
  }, over);
}

test("parseFrom handles names, quotes and bare addresses", () => {
  assert.deepEqual(plain(L.parseFrom('"Muster, Anna" <Anna@Example.ch>')), { name: "Muster, Anna", email: "anna@example.ch" });
  assert.deepEqual(plain(L.parseFrom("info@example.ch")), { name: "info@example.ch", email: "info@example.ch" });
  assert.deepEqual(plain(L.parseFrom("kaputt")), { name: "kaputt", email: "" });
});

test("parseGmailMessage: headers, Zurich time, labels, plain text preferred, links removed", () => {
  const m = plain(L.parseGmailMessage(gmailMsg(), { Label_7: "Studium" }, decode));
  assert.equal(m.fromName, "Studiensekretariat");
  assert.equal(m.fromEmail, "sekretariat@hochschule.example");
  assert.equal(m.subject, "Anmeldung Labor – Frist");
  assert.equal(m.receivedAt, "2026-11-16T09:12:00+01:00");
  assert.deepEqual(m.labelNames, ["Studium"]);
  assert.equal(m.snippet, "Bitte bestätigen Sie Ihre Anmeldung");
  assert.equal(m.text, "Bitte bestätigen Sie bis 27.11.\n[Link]\n\nGruss");
});

test("HTML-only mail is converted to text, scripts and styles removed", () => {
  const msg = gmailMsg({ payload: { mimeType: "text/html", headers: [], body: { data: b64("<style>p{}</style><p>Hallo&nbsp;Welt</p><script>x()</script><br>Zeile &amp; mehr &#252;") } } });
  assert.equal(L.parseGmailMessage(msg, {}, decode).text, "Hallo Welt\n\nZeile & mehr ü");
});

test("charset from the part header is used", () => {
  const latin = Buffer.from("Grüsse", "latin1").toString("base64url");
  const msg = gmailMsg({ payload: { mimeType: "text/plain", headers: [{ name: "Content-Type", value: "text/plain; charset=ISO-8859-1" }], body: { data: latin } } });
  assert.equal(L.parseGmailMessage(msg, {}, decode).text, "Grüsse");
});

test("own outgoing mail is skipped, mail to oneself is kept", () => {
  assert.equal(L.isOwnOutgoing(["SENT"]), true);
  assert.equal(L.isOwnOutgoing(["SENT", "INBOX"]), false);
  assert.equal(L.isOwnOutgoing(["INBOX"]), false);
});

test("search query: last sync minus 1 h, first run 3 days, spam/trash/drafts excluded", () => {
  const now = new Date("2026-11-16T10:00:00Z");
  assert.equal(L.mailSearchQuery("2026-11-16T10:50:00+01:00", now), "after:" + (Date.parse("2026-11-16T09:50:00Z") / 1000 - 3600) + " -in:drafts -in:spam -in:trash");
  assert.equal(L.mailSearchQuery(null, now), "after:" + (now.getTime() / 1000 - 3 * 86400) + " -in:drafts -in:spam -in:trash");
});

const parsed = () => L.parseGmailMessage(gmailMsg(), {}, decode);
const AI = { importance: 3, category: "Studium", summary: "Anmeldung bestätigen", actionRequired: true, todoTitle: "Laboranmeldung bestätigen", deadline: "2026-11-27", consequence: "Platz verfällt" };

test("finalizeMail: AI result, rule result, failed AI (importance 1, retry counter)", () => {
  const local = L.classifyLocal(parsed(), [], MCFG, true);
  const ai = plain(L.finalizeMail(parsed(), local, AI, "ok", 0, MCFG));
  assert.deepEqual([ai.classifiedBy, ai.importance, ai.deadline, ai.aiAttempts], ["ai", 3, "2026-11-27", 1]);
  const failed = plain(L.finalizeMail(parsed(), local, null, "failed", 1, MCFG));
  assert.deepEqual([failed.classifiedBy, failed.importance, failed.aiAttempts, failed.summary], ["none", 1, 2, "Bitte bestätigen Sie Ihre Anmeldung"]);
  assert.equal(L.needsAiRetry(failed), true);
  assert.equal(L.needsAiRetry(Object.assign({}, failed, { aiAttempts: 3 })), false);
  const skipped = plain(L.finalizeMail(parsed(), L.classifyLocal(parsed(), [], MCFG, false), null, "skipped", 0, MCFG));
  assert.deepEqual([skipped.classifiedBy, skipped.importance, skipped.aiAttempts], ["none", 1, 0]);
  assert.equal(L.needsAiRetry(skipped), true, "stored while AI was off -> classified once AI is available");
});

test("finalizeMail: sensitive mail keeps no content-derived text", () => {
  const rules = L.parseRules([["ja", "from", "hochschule.example", "", "Gesundheit", "ja", "ja", ""]]).rules;
  const local = L.classifyLocal(parsed(), rules, MCFG, true);
  assert.equal(local.toAi, false);
  const e = plain(L.finalizeMail(parsed(), local, null, "skipped", 0, MCFG));
  assert.deepEqual([e.sensitive, e.summary, e.classifiedBy, e.importance], [true, "", "rule", 2]);
  const n = plain(L.mailNotification(e));
  assert.deepEqual([n.title, n.body], ["Neue Mail", "Kategorie: Gesundheit"]);
  assert.ok(!JSON.stringify(n).includes("Anmeldung"));
  const t = plain(L.todoFromMail(Object.assign({}, e, { actionRequired: true }), "id1", "2026-11-16T10:00:00+01:00", "x"));
  assert.equal(t.title, "Nachricht prüfen: Gesundheit");
  assert.equal(t.notes, undefined);
});

test("AI category that is sensitive marks the mail sensitive afterwards", () => {
  const local = L.classifyLocal(parsed(), [], MCFG, true);
  const e = L.finalizeMail(parsed(), local, Object.assign({}, AI, { category: "Versicherung" }), "ok", 0, MCFG);
  assert.equal(e.sensitive, true);
  assert.equal(e.summary, "");
});

test("to-do and push decisions", () => {
  const local = L.classifyLocal(parsed(), [], MCFG, true);
  const e = L.finalizeMail(parsed(), local, AI, "ok", 0, MCFG);
  assert.equal(L.wantsAutoTodo(e), true);
  assert.equal(L.wantsPush(e), true);
  const t = plain(L.todoFromMail(e, "id1", "2026-11-16T10:00:00+01:00", e.todoTitle));
  assert.deepEqual([t.title, t.due, t.priority, t.source, t.mailId, t.dueHasTime], ["Laboranmeldung bestätigen", "2026-11-27", 2, "mail", "18c0aa", false]);
  const n = plain(L.mailNotification(e));
  assert.deepEqual(n, { title: "Dringend: Studiensekretariat", body: "Anmeldung Labor – Frist · bis 27.11.2026", priority: 4, clickUrl: "https://mail.google.com/mail/u/0/#all/18c0a0", tag: "mail" });
  const info = L.finalizeMail(parsed(), local, Object.assign({}, AI, { importance: 1 }), "ok", 0, MCFG);
  assert.equal(L.wantsAutoTodo(info), false);
  assert.equal(L.wantsPush(info), false);
  const rulePush = L.classifyLocal(parsed(), L.parseRules([["ja", "from", "hochschule", 1, "", "", "ja", ""]]).rules, MCFG, true);
  assert.equal(L.wantsPush(L.finalizeMail(parsed(), rulePush, null, "skipped", 0, MCFG)), true);
});

test("observe mode never plans mailbox changes; active mode labels, archives only explicitly unimportant mails (D24)", () => {
  const m = (o) => Object.assign({ category: "Studium", importance: 1, classifiedBy: "ai", sensitive: false, todoId: "" }, o);
  const e = [m({ id: "a" }), m({ id: "b", category: "" })];
  assert.deepEqual(plain(L.planLabelOps(e, { mode: "observe", archiveAfterLabel: "true" })), []);
  assert.deepEqual(plain(L.planLabelOps(e, { mode: "anything", archiveAfterLabel: "true" })), []);
  assert.deepEqual(plain(L.planLabelOps(e, { mode: "active", archiveAfterLabel: "false" })), [{ id: "a", addLabel: "Studium", archive: false }]);
  assert.deepEqual(plain(L.planLabelOps(e, { mode: "active", archiveAfterLabel: "true" })), [{ id: "a", addLabel: "Studium", archive: true }]);
  const cfg = { mode: "active", archiveAfterLabel: "true" };
  const arch = (o) => plain(L.planLabelOps([m(Object.assign({ id: "x" }, o))], cfg))[0].archive;
  assert.equal(arch({ importance: 0, classifiedBy: "rule" }), true);
  assert.equal(arch({ importance: 2 }), false, "important stays in the inbox");
  assert.equal(arch({ importance: 3 }), false);
  assert.equal(arch({ classifiedBy: "none" }), false, "AI unavailable: unrated mail stays");
  assert.equal(arch({ sensitive: true, importance: 0 }), false, "sensitive stays");
  assert.equal(arch({ todoId: "t1" }), false, "mail with a to-do stays");
  assert.equal(arch({ importance: "1" }), true, "sheet values may be strings");
});

test("gmail.js only modifies the mailbox in applyLabelOps_, and the pipeline passes planLabelOps", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const dir = path.join(__dirname, "..", "src", "gas");
  for (const f of fs.readdirSync(dir)) {
    const code = fs.readFileSync(path.join(dir, f), "utf8");
    const calls = code.match(/Gmail\.Users\.[A-Za-z.]+/g) || [];
    for (const c of calls) {
      assert.ok(["Gmail.Users.Labels.list", "Gmail.Users.Messages.list", "Gmail.Users.Messages.get", "Gmail.Users.Labels.create", "Gmail.Users.Messages.modify"].includes(c), f + ": " + c);
    }
    if (f !== "gmail.js") assert.ok(!/Labels\.create|Messages\.modify/.test(code), f + " must not modify Gmail");
    assert.ok(!/GmailApp|\.trash|\.delete\(|batchDelete/.test(code.replace(/sh\.deleteRow|deleteRows?|deleteTrigger|deleteSheet/g, "")), f + " must not use GmailApp or delete mail");
  }
  const pipeline = fs.readFileSync(path.join(dir, "pipeline.js"), "utf8");
  assert.match(pipeline, /applyLabelOps_\(planLabelOps\(/);
  assert.equal((pipeline.match(/applyLabelOps_\(/g) || []).length, 1);
});

test("mail rows round-trip and retention", () => {
  const e = L.finalizeMail(parsed(), L.classifyLocal(parsed(), [], MCFG, true), AI, "ok", 0, MCFG);
  const row = L.mailToRow(e);
  assert.equal(row.length, L.MAIL_COLUMNS.length);
  const o = L.mailRowObject(row);
  assert.deepEqual([o.id, o.importance, o.actionRequired, o.aiAttempts, o.deadline], ["18c0aa", 3, true, 1, "2026-11-27"]);
  const m = plain(L.rowToMail(row));
  assert.equal(m.mail.classifiedBy, "ai");
  const now = new Date("2026-12-20T10:00:00+01:00");
  assert.deepEqual(plain(L.expiredMailIds([o, { id: "new", receivedAt: "2026-12-19T10:00:00+01:00" }], now, "30")), ["18c0aa"]);
});
