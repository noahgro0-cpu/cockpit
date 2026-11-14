/**
 * setup(): run once from the editor (repeatable without data loss).
 * Personal defaults come from the git-ignored file src/private.local.js (COCKPIT_PRIVATE).
 */

function privateDefaults_() {
  return typeof COCKPIT_PRIVATE !== "undefined" ? COCKPIT_PRIVATE : {};
}

function setup() {
  var ss = ss_();
  ensureTabs_(ss);
  ensureConfig_();
  ensureSecrets_();
  ensureCalendars_();
  writeSetupCode_();
  ensureTriggers_();
  invalidateStateCache_();
  log_("info", "setup", "setup completed");
  Logger.log("Setup abgeschlossen. Setup-Code steht im Tab 'config' (Schlüssel setupCode).");
}

/** Generates a new API key; all devices need the new setup code afterwards. */
function rotateKey() {
  props_().setProperty("API_KEY", randomToken_(2));
  writeSetupCode_();
  log_("info", "setup", "API key rotated");
  Logger.log("Neuer Schlüssel erzeugt. Neuer Setup-Code steht im Tab 'config'.");
}

function randomToken_(uuids) {
  var s = "";
  for (var i = 0; i < uuids; i++) s += Utilities.getUuid().replace(/-/g, "");
  return s;
}

function ensureTabs_(ss) {
  var specs = tabSpecs_();
  Object.keys(specs).forEach(function (name) {
    var cols = specs[name];
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    var width = Math.max(sh.getLastColumn(), 1);
    var header = sh.getRange(1, 1, 1, width).getValues()[0].filter(function (h) {
      return h !== "";
    });
    for (var i = 0; i < header.length; i++) {
      if (header[i] !== cols[i]) {
        throw new Error("Tab '" + name + "': Spalte " + (i + 1) + " heisst '" + header[i] + "', erwartet '" + cols[i] + "'.");
      }
    }
    if (header.length < cols.length) {
      sh.getRange(1, header.length + 1, 1, cols.length - header.length).setValues([cols.slice(header.length)]);
    }
    sh.getRange(1, 1, 1, cols.length).setFontWeight("bold");
    sh.setFrozenRows(1);
    // Plain text keeps ISO strings from being converted into Sheets dates.
    if (sh.getMaxRows() > 1) sh.getRange(2, 1, sh.getMaxRows() - 1, cols.length).setNumberFormat("@");
  });
  // Remove the empty default tab of a new spreadsheet.
  ss.getSheets().forEach(function (sh) {
    if (!specs[sh.getName()] && sh.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(sh);
  });
}

/** Adds missing config keys only; never overwrites values the user changed. */
function ensureConfig_() {
  var present = {};
  readRows_("config").forEach(function (r) {
    present[String(r[0])] = true;
  });
  var priv = privateDefaults_();
  Object.keys(CONFIG_DEFAULTS).forEach(function (key) {
    if (present[key]) return;
    var v = priv[key] !== undefined ? priv[key] : CONFIG_DEFAULTS[key];
    writeRow_("config", [key, typeof v === "string" ? v : JSON.stringify(v)], 0);
  });
  configCache_ = null;
}

function ensureSecrets_() {
  var p = props_();
  if (!p.getProperty("API_KEY")) p.setProperty("API_KEY", randomToken_(2));
  if (!p.getProperty("NTFY_TOPIC")) p.setProperty("NTFY_TOPIC", "cockpit-" + randomToken_(1).slice(0, 24));
  if (!p.getProperty("NTFY_SERVER")) p.setProperty("NTFY_SERVER", "https://ntfy.sh");
  var url = privateDefaults_().webAppUrl;
  if (url) p.setProperty("WEB_APP_URL", url);
}

function ensureCalendars_() {
  var config = readConfig_();
  if (config.calExams && !CalendarApp.getCalendarsByName(config.calExams).length) {
    CalendarApp.createCalendar(config.calExams);
    log_("info", "setup", "exam calendar created");
  }
  if (config.calLectures && !CalendarApp.getCalendarsByName(config.calLectures).length) {
    log_("warn", "setup", "lecture calendar not found: check config.calLectures");
  }
}

/** Setup code = base64url (without padding) of {"u": web app URL, "k": API key}. */
function writeSetupCode_() {
  var p = props_();
  var url = p.getProperty("WEB_APP_URL") || "";
  if (!url) {
    setConfigValue_("setupCode", "(fehlt: WEB_APP_URL nicht gesetzt)");
    return;
  }
  var json = JSON.stringify({ u: url, k: p.getProperty("API_KEY") });
  var code = Utilities.base64EncodeWebSafe(json, Utilities.Charset.UTF_8).replace(/=+$/, "");
  setConfigValue_("setupCode", code);
}

function ensureTriggers_() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "tick") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("tick").timeBased().everyMinutes(10).create();
}
