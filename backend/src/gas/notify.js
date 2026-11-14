/**
 * Notifier: notify(msg) queues a channel-independent message; flushNotifications_ delivers due
 * messages over all channels. Channel 1 = ntfy (DECISIONS.md D6). A new channel only needs an
 * entry in notifyChannels_().
 * msg: {title, body, priority (1-5), clickUrl?, tag?}
 */

var NOTIFY_QUEUE_PROP = "NOTIFY_QUEUE";

function notifyChannels_() {
  return [{ name: "ntfy", send: ntfySend_ }];
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
    return code >= 200 && code < 300 ? { ok: true } : { ok: false, reason: "HTTP " + code };
  } catch (e) {
    return { ok: false, reason: String(e).slice(0, 120) };
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
  split.due.forEach(function (item) {
    var ok = notifyChannels_().every(function (ch) {
      var r = ch.send(item.msg);
      if (!r.ok) log_("warn", "notify", ch.name + " failed (attempt " + ((item.attempts || 0) + 1) + "): " + r.reason);
      return r.ok;
    });
    var next = afterSendAttempt(item, ok);
    if (ok) delivered.push(item.key);
    if (next.keep) keep.push(next.keep);
    if (next.dropped) log_("error", "notify", "message dropped after " + NOTIFY_MAX_ATTEMPTS + " attempts (" + (item.key || "no key") + ")");
  });
  writeQueue_(keep);
  return delivered;
}

/** Run from the editor: sends a test message right away (checks the ntfy subscription). */
function sendTestNotification() {
  var r = ntfySend_({
    title: "Cockpit-Test ✓",
    body: "Push funktioniert. Umlaute: äöü ÄÖÜ – Grüsse aus dem Backend.",
    priority: 3,
    tag: "white_check_mark",
  });
  log_(r.ok ? "info" : "warn", "notify", "test notification: " + (r.ok ? "sent" : r.reason));
  Logger.log(r.ok ? "Test-Mitteilung gesendet." : "Fehler: " + r.reason);
}
