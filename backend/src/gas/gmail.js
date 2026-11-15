/**
 * Gmail access via the Advanced Service (scope gmail.modify, see DECISIONS.md D2).
 * Read-only calls: Labels.list, Messages.list, Messages.get. The only mailbox change is
 * applyLabelOps_, which the pipeline calls only in mode "active".
 */

var LABEL_CACHE_KEY = "gmailLabels";

/** {labelId: name} for user labels, cached 6 h. */
function gmailLabelNames_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get(LABEL_CACHE_KEY);
  if (hit) return JSON.parse(hit);
  var map = {};
  (Gmail.Users.Labels.list("me").labels || []).forEach(function (l) {
    if (l.type === "user") map[l.id] = l.name;
  });
  cache.put(LABEL_CACHE_KEY, JSON.stringify(map), 21600);
  return map;
}

/** Message ids for a query, newest first, at most `max`. */
function gmailListIds_(query, max) {
  var ids = [];
  var token = null;
  do {
    var opts = { q: query, maxResults: 100 };
    if (token) opts.pageToken = token;
    var res = Gmail.Users.Messages.list("me", opts);
    (res.messages || []).forEach(function (m) {
      ids.push(m.id);
    });
    token = res.nextPageToken;
  } while (token && ids.length < max);
  return ids.slice(0, max);
}

/** Full message or null when it no longer exists. */
function gmailGet_(id) {
  try {
    return Gmail.Users.Messages.get("me", id, { format: "full" });
  } catch (e) {
    if (/not ?found|404/i.test(String(e))) return null;
    throw e;
  }
}

/** body.data of the advanced service: base64url string or byte array, depending on the runtime. */
function decodeGmailData_(data, charset) {
  var bytes = data;
  if (typeof data === "string") {
    var s = data.replace(/=+$/, "");
    while (s.length % 4) s += "=";
    bytes = Utilities.base64DecodeWebSafe(s);
  }
  var blob = Utilities.newBlob(bytes);
  try {
    return blob.getDataAsString(charset || "UTF-8");
  } catch (e) {
    return blob.getDataAsString("UTF-8");
  }
}

/**
 * Only for mode "active": after "War wichtig" the mail goes back to the inbox, after
 * "War unwichtig" it leaves it (if archiveAfterLabel is on). Errors are logged, never thrown.
 */
function setInbox_(messageId, inInbox) {
  try {
    var mod = inInbox ? { addLabelIds: ["INBOX"] } : { removeLabelIds: ["INBOX"] };
    Gmail.Users.Messages.modify(mod, "me", messageId);
  } catch (e) {
    log_("warn", "gmail", "inbox change failed for " + messageId + ": " + e);
  }
}

/**
 * Optional one-time cleanup (run from the editor, D24): archives the stored mails of the last
 * mailRetentionDays that mayArchive allows. Only works in mode "active" with archiveAfterLabel.
 */
function archiveInfoMails() {
  var config = readConfig_();
  if (config.mode !== "active" || !toBool(config.archiveAfterLabel)) {
    log_("info", "gmail", "archiveInfoMails: mode is not active or archiveAfterLabel is off, nothing done");
    return 0;
  }
  var ops = planLabelOps(readRows_("mails").map(mailRowObject), config).filter(function (op) {
    return op.archive;
  });
  applyLabelOps_(ops);
  log_("info", "gmail", "archiveInfoMails: " + ops.length + " mail(s) archived");
  return ops.length;
}

/** Only for mode "active": adds the category label (created if missing) and optionally archives. */
function applyLabelOps_(ops) {
  if (!ops.length) return;
  var byName = {};
  var names = gmailLabelNames_();
  Object.keys(names).forEach(function (id) {
    byName[names[id]] = id;
  });
  ops.forEach(function (op) {
    try {
      var labelId = byName[op.addLabel];
      if (!labelId) {
        labelId = Gmail.Users.Labels.create(
          { name: op.addLabel, labelListVisibility: "labelShow", messageListVisibility: "show" },
          "me"
        ).id;
        byName[op.addLabel] = labelId;
        CacheService.getScriptCache().remove(LABEL_CACHE_KEY);
      }
      var mod = { addLabelIds: [labelId] };
      if (op.archive) mod.removeLabelIds = ["INBOX"];
      Gmail.Users.Messages.modify(mod, "me", op.id);
    } catch (e) {
      log_("warn", "gmail", "label failed for " + op.id + ": " + e);
    }
  });
}
