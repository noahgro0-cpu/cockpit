/**
 * Mail pipeline logic (pure): Gmail message parsing, final classification, to-do and push planning.
 * Mail content is untrusted input: it is only ever treated as data.
 */

var MAIL_TEXT_LIMIT = 3000;
var MAIL_LIMITS = { subject: 300, fromName: 120, fromEmail: 200, summary: 240, consequence: 200, todoTitle: 120 };

function headerValue_(headers, name) {
  var lower = name.toLowerCase();
  for (var i = 0; i < (headers || []).length; i++) {
    if (String(headers[i].name || "").toLowerCase() === lower) return String(headers[i].value || "");
  }
  return "";
}

/** Removes control characters, collapses whitespace and cuts to max characters. */
function cleanLine(s, max) {
  var t = String(s == null ? "" : s)
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return max && t.length > max ? t.slice(0, max - 1).trimEnd() + "…" : t;
}

/** "Name <a@b.ch>" / "a@b.ch" / "\"Name\" <a@b.ch>" -> {name, email}. */
function parseFrom(value) {
  var v = String(value || "").trim();
  var m = /^(.*?)\s*<([^<>\s]+@[^<>\s]+)>\s*$/.exec(v);
  var name = m ? m[1] : "";
  var email = m ? m[2] : v;
  name = name.replace(/^"(.*)"$/, "$1").trim();
  email = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+$/.test(email)) {
    if (!m) name = v; // no address at all: keep the raw text as the name
    email = "";
  }
  return { name: cleanLine(name || email, MAIL_LIMITS.fromName), email: cleanLine(email, MAIL_LIMITS.fromEmail) };
}

var HTML_ENTITIES_ = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", auml: "ä", ouml: "ö", uuml: "ü", Auml: "Ä", Ouml: "Ö", Uuml: "Ü", eacute: "é", egrave: "è", agrave: "à", szlig: "ss" };

function decodeEntities(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, function (all, e) {
    if (e[0] === "#") {
      var code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : " ";
    }
    return Object.prototype.hasOwnProperty.call(HTML_ENTITIES_, e) ? HTML_ENTITIES_[e] : all;
  });
}

function htmlToText(html) {
  return decodeEntities(
    String(html || "")
      .replace(/<(script|style|head|title)[\s\S]*?<\/\1\s*>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(br|\/p|\/div|\/tr|\/li|\/h\d)\b[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  );
}

/** Normalises body text for the AI: no URLs (never fetched anyway), compact whitespace, max length. */
function compactMailText(text, max) {
  var t = String(text || "")
    .replace(/https?:\/\/\S+/gi, "[Link]")
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, " ")
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/[ \t]*\r?\n[ \t]*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  var limit = max || MAIL_TEXT_LIMIT;
  return t.length > limit ? t.slice(0, limit) : t;
}

/**
 * Plain text of a Gmail API payload. decode(data, charset) turns body.data into a string.
 * Prefers text/plain, falls back to text/html; attachments are ignored.
 */
function extractMailText(payload, decode) {
  var plain = [];
  var html = [];
  (function walk(part) {
    if (!part) return;
    var type = String(part.mimeType || "").toLowerCase();
    var isAttachment = !!part.filename || /attachment/i.test(headerValue_(part.headers, "Content-Disposition"));
    if (!isAttachment && part.body && part.body.data && (type === "text/plain" || type === "text/html")) {
      var ct = headerValue_(part.headers, "Content-Type");
      var cs = /charset="?([A-Za-z0-9_\-:.]+)"?/i.exec(ct);
      var text = decode(part.body.data, cs ? cs[1] : "UTF-8");
      (type === "text/plain" ? plain : html).push(text);
    }
    (part.parts || []).forEach(walk);
  })(payload);
  if (plain.length) return compactMailText(plain.join("\n"));
  return compactMailText(htmlToText(html.join("\n")));
}

/**
 * Gmail API message (format "full") -> mail record without classification.
 * labelNamesById maps label ids to names (for the user's own category labels).
 */
function parseGmailMessage(msg, labelNamesById, decode) {
  var headers = (msg.payload && msg.payload.headers) || [];
  var from = parseFrom(headerValue_(headers, "From"));
  var labelIds = msg.labelIds || [];
  return {
    id: String(msg.id),
    threadId: String(msg.threadId || msg.id),
    receivedAt: toZurichIso(new Date(Number(msg.internalDate) || Date.now())),
    fromName: from.name,
    fromEmail: from.email,
    subject: cleanLine(headerValue_(headers, "Subject") || "(ohne Betreff)", MAIL_LIMITS.subject),
    snippet: cleanLine(decodeEntities(msg.snippet || ""), MAIL_LIMITS.summary),
    labelIds: labelIds,
    labelNames: labelIds.map(function (id) {
      return (labelNamesById && labelNamesById[id]) || "";
    }).filter(Boolean),
    text: msg.payload ? extractMailText(msg.payload, decode) : "",
  };
}

/** Messages that are only in "Sent" (own outgoing mail) are skipped; mail to oneself stays. */
function isOwnOutgoing(labelIds) {
  var ids = labelIds || [];
  return ids.indexOf("SENT") >= 0 && ids.indexOf("INBOX") < 0;
}

/** Gmail search for the pipeline. `after:` accepts epoch seconds. */
function mailSearchQuery(lastSyncIso, now) {
  var since = lastSyncIso && !isNaN(Date.parse(lastSyncIso))
    ? Date.parse(lastSyncIso) - 3600 * 1000
    : now.getTime() - 3 * MS_PER_DAY;
  return "after:" + Math.floor(since / 1000) + " -in:drafts -in:spam -in:trash";
}

/**
 * Final mail entry (row object in MAIL_COLUMNS order) from the parsed mail, the local
 * classification and an optional validated AI result.
 * aiState: "ok" (ai given), "failed" (AI was wanted but failed), "skipped" (no AI wanted/available).
 */
function finalizeMail(mail, local, ai, aiState, prevAttempts, mcfg) {
  var e = {
    id: mail.id,
    threadId: mail.threadId,
    receivedAt: mail.receivedAt,
    fromName: mail.fromName,
    fromEmail: mail.fromEmail,
    subject: mail.subject,
    category: local.category,
    importance: 1,
    summary: "",
    actionRequired: false,
    deadline: "",
    consequence: "",
    sensitive: local.sensitive,
    classifiedBy: "none",
    todoId: "",
    dismissed: false,
    notifiedAt: "",
    aiAttempts: prevAttempts || 0,
    // internal, not stored:
    push: local.push,
    todoTitle: "",
  };
  if (local.importance !== null) {
    e.importance = local.importance;
    e.classifiedBy = "rule";
  } else if (ai) {
    e.importance = ai.importance;
    e.category = local.category || ai.category;
    e.summary = ai.summary;
    e.actionRequired = ai.actionRequired;
    e.deadline = ai.deadline || "";
    e.consequence = ai.consequence || "";
    e.todoTitle = ai.todoTitle || "";
    e.classifiedBy = "ai";
    e.aiAttempts = (prevAttempts || 0) + 1;
  } else if (aiState === "failed") {
    e.aiAttempts = (prevAttempts || 0) + 1;
  }
  if (isSensitiveCategory(e.category, mcfg)) e.sensitive = true;
  if (e.sensitive) {
    // Nothing content-derived is kept for sensitive mails beyond sender and subject.
    e.summary = "";
    e.todoTitle = "";
  } else if (!e.summary) {
    e.summary = mail.snippet || "";
  }
  return e;
}

/**
 * Whether a stored mail should (again) go to the AI: not classified yet, not sensitive, fewer than
 * 3 failed attempts. Covers mails stored while the AI was off, once it becomes available.
 */
function needsAiRetry(entry) {
  return entry.classifiedBy === "none" && !entry.sensitive && entry.aiAttempts < 3;
}

function mailToRow(e) {
  return MAIL_COLUMNS.map(function (c) {
    var v = e[c];
    return v === undefined || v === null ? "" : v;
  });
}

/** Row array -> plain object keyed by MAIL_COLUMNS (raw values). */
function mailRowObject(row) {
  var o = {};
  for (var i = 0; i < MAIL_COLUMNS.length; i++) o[MAIL_COLUMNS[i]] = row[i];
  o.importance = Number(o.importance) || 0;
  o.actionRequired = toBool(o.actionRequired);
  o.sensitive = toBool(o.sensitive);
  o.dismissed = toBool(o.dismissed);
  o.aiAttempts = Number(o.aiAttempts) || 0;
  o.receivedAt = normalizeDateCell(o.receivedAt, false);
  o.deadline = normalizeDateCell(o.deadline, true);
  o.id = String(o.id);
  o.threadId = String(o.threadId);
  o.todoId = String(o.todoId || "");
  o.category = String(o.category || "");
  return o;
}

/** To-do for a mail (automatic or via `mail.toTodo`). */
function todoFromMail(mail, id, nowIso, title) {
  var t = {
    id: id,
    title: mail.sensitive
      ? "Nachricht prüfen: " + (mail.category || "Mail")
      : cleanLine(title || mail.subject || "Mail bearbeiten", TODO_LIMITS.title),
    priority: mail.importance >= 3 ? 2 : 1,
    mailId: mail.id,
  };
  if (mail.deadline && isIsoDate(mail.deadline)) t.due = mail.deadline;
  if (!mail.sensitive && mail.summary) t.notes = mail.summary;
  return newTodo(t, nowIso, "mail");
}

function wantsAutoTodo(entry) {
  return entry.actionRequired && entry.importance >= 2;
}

function wantsPush(entry) {
  return entry.importance >= 3 || !!entry.push;
}

function gmailThreadUrl(threadId) {
  return "https://mail.google.com/mail/u/0/#all/" + encodeURIComponent(threadId);
}

/** Push text for a mail: sender and subject only; sensitive mails only show the category. */
function mailNotification(entry) {
  var urgent = entry.importance >= 3;
  if (entry.sensitive) {
    return {
      title: urgent ? "Dringende Mail" : "Neue Mail",
      body: "Kategorie: " + (entry.category || "vertraulich"),
      priority: urgent ? 4 : 3,
      clickUrl: gmailThreadUrl(entry.threadId),
      tag: "mail",
    };
  }
  var body = entry.subject;
  if (entry.deadline) body += " · bis " + formatDateCh(entry.deadline);
  return {
    title: (urgent ? "Dringend: " : "Mail: ") + (entry.fromName || entry.fromEmail || "Unbekannt"),
    body: body,
    priority: urgent ? 4 : 3,
    clickUrl: gmailThreadUrl(entry.threadId),
    tag: "mail",
  };
}

/** "2026-11-27" -> "27.11.2026" */
function formatDateCh(isoDate) {
  var p = String(isoDate).slice(0, 10).split("-");
  return p.length === 3 ? p[2] + "." + p[1] + "." + p[0] : String(isoDate);
}

/**
 * Gmail label changes for processed mails. Empty unless mode is "active": in observe mode
 * the mailbox is never changed.
 */
function planLabelOps(entries, config) {
  if (config.mode !== "active") return [];
  var archive = toBool(config.archiveAfterLabel);
  return entries
    .filter(function (e) {
      return !!e.category;
    })
    .map(function (e) {
      return { id: e.id, addLabel: e.category, archive: archive };
    });
}

/** Ids of mails whose rows are older than the retention period. */
function expiredMailIds(entries, now, retentionDays) {
  var days = Number(retentionDays) > 0 ? Number(retentionDays) : 30;
  var cutoff = now.getTime() - days * MS_PER_DAY;
  return entries
    .filter(function (e) {
      var t = Date.parse(e.receivedAt);
      return !isNaN(t) && t < cutoff;
    })
    .map(function (e) {
      return e.id;
    });
}
