/**
 * Notifier: notify(msg) queues a channel-independent message; flushNotifications_ delivers due
 * messages over the active channels (config.pushChannels, DECISIONS.md D19). Channels: telegram,
 * ntfy (D6). A new channel only needs an entry in allChannels_().
 * msg: {title, body, priority (1-5), clickUrl?, tag?}
 */

var NOTIFY_QUEUE_PROP = "NOTIFY_QUEUE";

function allChannels_() {
  var p = props_();
  return [
    { name: "telegram", configured: !!(p.getProperty("TELEGRAM_BOT_TOKEN") && p.getProperty("TELEGRAM_CHAT_ID")), send: telegramSend_ },
    { name: "ntfy", configured: !!p.getProperty("NTFY_TOPIC"), send: ntfySend_ },
  ];
}

function notifyChannels_() {
  var all = allChannels_();
  var names = activeChannelNames(readConfig_().pushChannels, all);
  return all.filter(function (c) {
    return names.indexOf(c.name) >= 0;
  });
}

/** Sends one message over the active channels; delivered when at least one channel succeeds. */
function sendViaChannels_(msg, attemptLabel) {
  var channels = notifyChannels_();
  if (!channels.length) return { ok: false, network: false, reason: "no push channel configured" };
  var ok = false;
  var network = false;
  var reasons = [];
  channels.forEach(function (ch) {
    var r = ch.send(msg);
    if (r.ok) ok = true;
    else {
      if (r.network) network = true;
      reasons.push(ch.name + ": " + r.reason);
      log_("warn", "notify", ch.name + " failed" + (attemptLabel ? " (" + attemptLabel + ")" : "") + ": " + r.reason);
    }
  });
  return { ok: ok, network: !ok && network, reason: reasons.join("; ") };
}

/** Telegram Bot API sendMessage (plain text, no link previews). */
function telegramSend_(msg) {
  var p = props_();
  var token = p.getProperty("TELEGRAM_BOT_TOKEN");
  var chatId = p.getProperty("TELEGRAM_CHAT_ID");
  if (!token || !chatId) return { ok: false, reason: "TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID missing" };
  try {
    var res = UrlFetchApp.fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
      method: "post",
      contentType: "application/json; charset=utf-8",
      payload: JSON.stringify(telegramBody(msg, chatId)),
      muteHttpExceptions: true,
    });
    var code = res.getResponseCode();
    if (code === 200) return { ok: true };
    var desc = "";
    try {
      desc = String(JSON.parse(res.getContentText()).description || "").slice(0, 80);
    } catch (ignored) {
      desc = "";
    }
    return { ok: false, reason: "HTTP " + code + (desc ? " (" + desc + ")" : "") };
  } catch (e) {
    // Never include the URL: it contains the bot token.
    return { ok: false, network: true, reason: String(e).split(token).join("<token>").slice(0, 120) };
  }
}

/**
 * Run from the editor after sending /start to the new bot: stores the chat id of the most recent
 * private chat as TELEGRAM_CHAT_ID and sends a test message. The chat id is not logged.
 */
function telegramSetup() {
  var p = props_();
  var token = p.getProperty("TELEGRAM_BOT_TOKEN");
  if (!token) {
    Logger.log("Zuerst die Skripteigenschaft TELEGRAM_BOT_TOKEN eintragen.");
    return;
  }
  var res;
  try {
    res = UrlFetchApp.fetch("https://api.telegram.org/bot" + token + "/getUpdates", { muteHttpExceptions: true });
  } catch (e) {
    Logger.log("Telegram nicht erreichbar: " + String(e).split(token).join("<token>").slice(0, 120));
    return;
  }
  if (res.getResponseCode() !== 200) {
    Logger.log("Telegram antwortet mit HTTP " + res.getResponseCode() + ": Token prüfen.");
    return;
  }
  var chatId = latestPrivateChatId(JSON.parse(res.getContentText()));
  if (!chatId) {
    Logger.log("Kein Chat gefunden. In Telegram dem Bot /start schreiben und erneut ausführen.");
    return;
  }
  p.setProperty("TELEGRAM_CHAT_ID", String(chatId));
  var r = telegramSend_({ title: "Cockpit verbunden ✓", body: "Ab jetzt kommen die Cockpit-Mitteilungen hier an.", priority: 3 });
  log_(r.ok ? "info" : "warn", "notify", "telegram setup: " + (r.ok ? "chat stored, test sent" : r.reason));
  Logger.log(r.ok ? "Chat gespeichert, Test-Mitteilung gesendet." : "Fehler: " + r.reason);
}

function readQueue_() {
  try {
    var q = JSON.parse(props_().getProperty(NOTIFY_QUEUE_PROP) || "[]");
    return Array.isArray(q) ? q : [];
  } catch (e) {
    return [];
  }
}

function writeQueue_(q) {
  props_().setProperty(NOTIFY_QUEUE_PROP, JSON.stringify(q));
}

/** Queues a message. opts: {key (dedupe), ignoreQuiet, config}. */
function notify(msg, opts) {
  var o = opts || {};
  var config = o.config || readConfig_();
  var at = deliverAfter(new Date(), config, !!o.ignoreQuiet);
  writeQueue_(enqueue(readQueue_(), [queueItem(msg, at, o.key)]));
}

/** {ok, retry} for one channel send. */
function ntfySend_(msg) {
  var p = props_();
  var topic = p.getProperty("NTFY_TOPIC");
  if (!topic) return { ok: false, reason: "NTFY_TOPIC missing" };
  var server = (p.getProperty("NTFY_SERVER") || "https://ntfy.sh").replace(/\/+$/, "");
  var headers = {};
  var token = p.getProperty("NTFY_TOKEN");
  if (token) headers.Authorization = "Bearer " + token;
  try {
    var res = UrlFetchApp.fetch(server + "/", {
      method: "post",
      contentType: "application/json; charset=utf-8",
      headers: headers,
      payload: JSON.stringify(ntfyBody(msg, topic)),
      muteHttpExceptions: true,
    });
    var code = res.getResponseCode();
    if (code >= 200 && code < 300) return { ok: true };
    var detail = "";
    try {
      var err = JSON.parse(res.getContentText());
      detail = " (ntfy " + err.code + ": " + String(err.error || "").slice(0, 60) + (token ? ", with token" : ", no token") + ")";
    } catch (ignored) {
      detail = token ? " (with token)" : " (no token)";
    }
    return { ok: false, reason: "HTTP " + code + detail };
  } catch (e) {
    // Network-level failure (e.g. "Address unavailable"): may hang long, so the caller stops for this tick.
    return { ok: false, network: true, reason: String(e).slice(0, 120) };
  }
}

/** Sends due messages. Returns the keys that were delivered. */
function flushNotifications_() {
  var queue = readQueue_();
  if (!queue.length) return [];
  var split = dueQueueItems(queue, new Date());
  if (!split.due.length) return [];
  var keep = split.rest;
  var delivered = [];
  var networkDown = false;
  split.due.forEach(function (item) {
    if (networkDown) {
      keep.push(item); // not attempted: no attempt counted
      return;
    }
    var r = sendViaChannels_(item.msg, "attempt " + ((item.attempts || 0) + 1));
    if (r.network) networkDown = true;
    var ok = r.ok;
    var next = afterSendAttempt(item, ok);
    if (ok) delivered.push(item.key);
    if (next.keep) keep.push(next.keep);
    if (next.dropped) log_("error", "notify", "message dropped after " + NOTIFY_MAX_ATTEMPTS + " attempts (" + (item.key || "no key") + ")");
  });
  writeQueue_(keep);
  return delivered;
}

/** Run from the editor: sends a test message right away over the active channels. */
function sendTestNotification() {
  var r = sendViaChannels_({
    title: "Cockpit-Test ✓",
    body: "Push funktioniert. Umlaute: äöü ÄÖÜ – Grüsse aus dem Backend.",
    priority: 3,
    tag: "white_check_mark",
  });
  log_(r.ok ? "info" : "warn", "notify", "test notification: " + (r.ok ? "sent" : r.reason));
  Logger.log(r.ok ? "Test-Mitteilung gesendet." : "Fehler: " + r.reason);
}

/**
 * Run from the editor: checks from Google servers which requests to ntfy work (GET and POST variants).
 * POSTs go to a random throw-away topic, never to NTFY_TOPIC. Results go to the execution log and tab "log".
 */
function diagnoseNtfy() {
  var server = (props_().getProperty("NTFY_SERVER") || "https://ntfy.sh").replace(/\/+$/, "");
  var topic = "diag-" + Utilities.getUuid();
  var json = JSON.stringify({ topic: topic, title: "diag", message: "x", priority: 3 });
  var cases = [
    ["GET health", server + "/v1/health", { method: "get" }],
    ["POST json root", server + "/", { method: "post", contentType: "application/json; charset=utf-8", payload: json }],
    ["POST json root no slash", server, { method: "post", contentType: "application/json", payload: json }],
    ["POST text topic", server + "/" + topic, { method: "post", contentType: "text/plain; charset=utf-8", payload: "x" }],
    ["PUT text topic", server + "/" + topic, { method: "put", contentType: "text/plain; charset=utf-8", payload: "x" }],
    ["POST httpbin", "https://httpbin.org/post", { method: "post", contentType: "application/json", payload: json }],
  ];
  var lines = cases.map(function (c) {
    var t = Date.now();
    var opts = Object.assign({ muteHttpExceptions: true, followRedirects: false }, c[2]);
    try {
      var res = UrlFetchApp.fetch(c[1], opts);
      return c[0] + " -> HTTP " + res.getResponseCode() + " in " + (Date.now() - t) + " ms " + res.getContentText().slice(0, 60).replace(/\s+/g, " ");
    } catch (e) {
      return c[0] + " -> " + String(e).slice(0, 80) + " after " + (Date.now() - t) + " ms";
    }
  });
  lines.push(ntfyAccountCheck_(server));
  lines.forEach(function (l) {
    Logger.log(l.replace(topic, "diag-…"));
  });
  log_("info", "notify", ("diagnose: " + lines.join(" | ")).split(topic).join("diag-…"));
}

/** Token check via GET /v1/account: only tier, limits and usage are reported, never the user name. */
function ntfyAccountCheck_(server) {
  var token = props_().getProperty("NTFY_TOKEN");
  if (!token) return "account -> NTFY_TOKEN not set (property names: " + props_().getKeys().filter(function (k) {
    return /ntfy/i.test(k);
  }).join(", ") + ")";
  try {
    var res = UrlFetchApp.fetch(server + "/v1/account", { headers: { Authorization: "Bearer " + token }, muteHttpExceptions: true });
    var code = res.getResponseCode();
    if (code !== 200) return "account -> HTTP " + code + " (token invalid or expired?)";
    var a = JSON.parse(res.getContentText());
    var lim = a.limits || {};
    var st = a.stats || {};
    return "account -> token ok, tier " + (a.tier ? a.tier.code : "none") + ", limit basis " + (lim.basis || "?") +
      ", messages " + st.messages + "/" + lim.messages + " (remaining " + st.messages_remaining + ")";
  } catch (e) {
    return "account -> " + String(e).slice(0, 80);
  }
}
