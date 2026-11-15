/**
 * Time-driven trigger (every 10 min): mail pipeline, reminders, briefing, push delivery, housekeeping.
 * Overlapping runs are prevented with the document lock; API writes use the script lock, so a long
 * AI call in tick never blocks the clients for its whole duration.
 */

var TICK_BUDGET_MS = 4 * 60 * 1000;
var SCHEMA_VERSION = "8";

function tick() {
  var lock = LockService.getDocumentLock();
  if (!lock || !lock.tryLock(1000)) return; // a previous run is still active
  var t0 = Date.now();
  var failed = [];
  function step(name, fn) {
    try {
      return fn();
    } catch (err) {
      failed.push(name);
      log_("error", "tick", name + ": " + (err && err.stack ? err.stack : err));
      return null;
    }
  }
  try {
    step("schema", ensureSchema_);
    var mail = step("mail", function () {
      return runMailPipeline_(t0 + TICK_BUDGET_MS);
    });
    step("reminders", runReminders_);
    step("briefing", runBriefing_);
    step("notify", function () {
      markMailsNotified_(flushNotifications_());
    });
    step("cleanup", function () {
      trimLog_();
      dailyCleanup_();
    });
    var p = props_();
    p.setProperty("LAST_TICK", toZurichIso(new Date()));
    var ms = Date.now() - t0;
    if (mail && (mail.fresh || mail.retried)) {
      log_("info", "tick", "mails: " + mail.fresh + " new, " + mail.retried + " retried, " + mail.ai + " by AI; " + ms + " ms");
    }
    step("health", function () {
      trackTickHealth_(failed.length === 0, failed);
    });
    invalidateStateCache_();
    step("runtime", function () {
      trackTickRuntime_(Date.now() - t0);
    });
  } finally {
    lock.releaseLock();
  }
}

/** Counts failed ticks in a row; after 3, alerts once per 6 h (directly, not via the queue). */
/** Adds this run to TICK_STATS; logs the previous day's total once the date changes (Phase 4 measurement). */
function trackTickRuntime_(ms) {
  var p = props_();
  var prev = null;
  try {
    prev = JSON.parse(p.getProperty("TICK_STATS") || "null");
  } catch (e) {
    prev = null;
  }
  var r = accumulateTickStats(prev, toZurichDate(new Date()), ms);
  p.setProperty("TICK_STATS", JSON.stringify(r.stats));
  if (r.done) log_("info", "tick", tickStatsText(r.done));
}

function trackTickHealth_(ok, failedSteps) {
  var p = props_();
  var now = Date.now();
  var r = failureTracking(Number(p.getProperty("TICK_FAILS")) || 0, ok, Number(p.getProperty("LAST_FAILURE_ALERT")) || 0, now);
  p.setProperty("TICK_FAILS", String(r.fails));
  if (!r.alert) return;
  var sent = sendViaChannels_({
    title: "Cockpit: Störung im Backend",
    body: r.fails + " Durchläufe in Folge fehlgeschlagen (" + failedSteps.join(", ") + "). Details im Sheet, Tab «log».",
    priority: 4,
    tag: "warning",
  });
  if (sent.ok) p.setProperty("LAST_FAILURE_ALERT", String(now));
}

/** Brings tabs, config and starter rules up to date after a code update (no editor run needed). */
function ensureSchema_() {
  var p = props_();
  if (p.getProperty("SCHEMA_VERSION") === SCHEMA_VERSION) return;
  withWriteLock_(function () {
    ensureTabs_(ss_());
    ensureConfig_();
    seedRules_();
    // One-time: values for the iOS shortcuts, so no editor run is needed (D20).
    if (props_().getProperty("SHORTCUT_ROWS") !== "1") writeShortcutRows_();
    // One-time (user request 2026-11-15, D24): unimportant mails leave the inbox. Reversible in
    // the sheet: config mode = observe or archiveAfterLabel = false.
    if (props_().getProperty("ARCHIVE_ON") !== "1") {
      setConfigValue_("mode", "active");
      setConfigValue_("archiveAfterLabel", "true");
      props_().setProperty("ARCHIVE_ON", "1");
      log_("info", "setup", "mode active, archiveAfterLabel true (D24)");
    }
  });
  // One-time (D25): mailbox label for mails stored before schema 8. Outside the write lock (Gmail calls).
  if (p.getProperty("ACCOUNTS_BACKFILLED") !== "1") {
    var filled = backfillMailAccounts_();
    p.setProperty("ACCOUNTS_BACKFILLED", "1");
    log_("info", "setup", "mailbox label set for " + filled + " stored mail(s)");
  }
  p.setProperty("SCHEMA_VERSION", SCHEMA_VERSION);
  log_("info", "setup", "schema updated to version " + SCHEMA_VERSION);
}
