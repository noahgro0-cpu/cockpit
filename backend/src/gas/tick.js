/** Time-driven trigger (every 10 min). Phase 1a: heartbeat and housekeeping only. */

function tick() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return; // a previous run is still active
  try {
    trimLog_();
    props_().setProperty("LAST_TICK", toZurichIso(new Date()));
    invalidateStateCache_();
  } catch (err) {
    log_("error", "tick", err);
  } finally {
    lock.releaseLock();
  }
}
