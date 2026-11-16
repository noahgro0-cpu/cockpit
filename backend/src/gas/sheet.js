/** Spreadsheet access, config, logging and the state cache. */

var RULE_COLUMNS = ["aktiv", "feld", "muster", "importance", "kategorie", "sensibel", "push", "kommentar"];
var LOG_MAX_ROWS = 500;

/** Tab name -> header columns. A function, because the column lists live in other files. */
function tabSpecs_() {
  return {
    todos: TODO_COLUMNS,
    mails: MAIL_COLUMNS,
    regeln: RULE_COLUMNS,
    config: ["key", "value"],
    log: ["ts", "level", "area", "message"],
    faecher: SUBJECT_COLUMNS,
    notizen: NOTE_COLUMNS, // D28
    bilder: IMAGE_COLUMNS,
    termin_faecher: EVENT_SUBJECT_COLUMNS,
  };
}

function ss_() {
  var ss = SpreadsheetApp.getActive();
  if (!ss) throw new Error("No bound spreadsheet");
  return ss;
}

function sheet_(name) {
  var sh = ss_().getSheetByName(name);
  if (!sh) throw apiError("internal", "Sheet tab missing: " + name + " (run setup)");
  return sh;
}

/** Data rows (without header) as arrays; rows with an empty first cell are skipped. */
function readRows_(name) {
  var sh = sheet_(name);
  var last = sh.getLastRow();
  if (last < 2) return [];
  var width = tabSpecs_()[name].length;
  return sh.getRange(2, 1, last - 1, width).getValues().filter(function (r) {
    return r[0] !== "" && r[0] !== null;
  });
}

/** Writes one row at a 1-based sheet row, or appends it when rowNum is falsy. */
function writeRow_(name, row, rowNum) {
  var sh = sheet_(name);
  var target = rowNum || sh.getLastRow() + 1;
  if (target > sh.getMaxRows()) {
    sh.insertRowsAfter(sh.getMaxRows(), 200);
    sh.getRange(target, 1, 200, row.length).setNumberFormat("@");
  }
  sh.getRange(target, 1, 1, row.length).setValues([row]);
  return target;
}

/** 1-based sheet row of the record whose first column equals id, or 0. */
function findRow_(name, id) {
  var sh = sheet_(name);
  var last = sh.getLastRow();
  if (last < 2) return 0;
  var ids = sh.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) if (String(ids[i][0]) === id) return i + 2;
  return 0;
}

// --- Config ---------------------------------------------------------------

var configCache_ = null;

function readConfig_() {
  if (!configCache_) configCache_ = parseConfigRows(readRows_("config"));
  return configCache_;
}

function setConfigValue_(key, value) {
  var row = findRow_("config", key);
  writeRow_("config", [key, value], row);
  configCache_ = null;
}

function props_() {
  return PropertiesService.getScriptProperties();
}

// --- Log ------------------------------------------------------------------

function log_(level, area, message) {
  try {
    var text = message && message.stack ? message.stack : String(message);
    sheet_("log").appendRow([toZurichIso(new Date()), level, area, text.slice(0, 500)]);
  } catch (e) {
    console.error("log failed: " + e);
  }
}

function trimLog_() {
  var sh = sheet_("log");
  var excess = sh.getLastRow() - 1 - LOG_MAX_ROWS;
  if (excess > 0) sh.deleteRows(2, excess);
}

// --- State cache (CacheService: max 100 KB per value -> chunked) ------------

var STATE_CACHE_KEY = "state";
var CACHE_CHUNK_CHARS = 40000; // UTF-8 can use up to 2.5 bytes per char here; stays below 100 KB

function cacheGetChunked_(key) {
  var cache = CacheService.getScriptCache();
  var n = Number(cache.get(key + ":n"));
  if (!n) return null;
  var keys = [];
  for (var i = 0; i < n; i++) keys.push(key + ":" + i);
  var parts = cache.getAll(keys);
  var out = "";
  for (var j = 0; j < n; j++) {
    if (parts[keys[j]] == null) return null;
    out += parts[keys[j]];
  }
  return out;
}

function cachePutChunked_(key, text, ttlSeconds) {
  var n = Math.ceil(text.length / CACHE_CHUNK_CHARS);
  if (n > 20) return; // too large to be worth caching
  var map = {};
  for (var i = 0; i < n; i++) map[key + ":" + i] = text.substr(i * CACHE_CHUNK_CHARS, CACHE_CHUNK_CHARS);
  map[key + ":n"] = String(n);
  CacheService.getScriptCache().putAll(map, ttlSeconds);
}

function invalidateStateCache_() {
  CacheService.getScriptCache().remove(STATE_CACHE_KEY + ":n");
}

// --- Bulk helpers (phase 1b) -------------------------------------------------

/** All non-empty data rows with their 1-based sheet row numbers (rows with an empty first cell included). */
function readRowsRaw_(name) {
  var sh = sheet_(name);
  var last = sh.getLastRow();
  var out = { rows: [], rowNums: [] };
  if (last < 2) return out;
  var width = tabSpecs_()[name].length;
  sh.getRange(2, 1, last - 1, width).getValues().forEach(function (r, i) {
    var empty = r.every(function (c) {
      return c === "" || c === null;
    });
    if (empty) return;
    out.rows.push(r);
    out.rowNums.push(i + 2);
  });
  return out;
}

/** Appends several rows in one call. */
function appendRows_(name, rows) {
  if (!rows.length) return;
  var sh = sheet_(name);
  var start = sh.getLastRow() + 1;
  var needed = start + rows.length - 1;
  if (needed > sh.getMaxRows()) {
    var add = needed - sh.getMaxRows() + 200;
    sh.insertRowsAfter(sh.getMaxRows(), add);
  }
  var range = sh.getRange(start, 1, rows.length, rows[0].length);
  range.setNumberFormat("@");
  range.setValues(rows);
}

/** Sets single cells of one row: values = {columnName: value}. */
function setCells_(name, rowNum, values) {
  var cols = tabSpecs_()[name];
  var sh = sheet_(name);
  Object.keys(values).forEach(function (col) {
    var c = cols.indexOf(col);
    if (c < 0) throw new Error("unknown column " + col);
    var v = values[col];
    sh.getRange(rowNum, c + 1).setValue(v === undefined || v === null ? "" : typeof v === "boolean" ? String(v).toUpperCase() : v);
  });
}

/** Mail rows as objects with row numbers: {list: [obj], byId: {id: obj}}; obj.rowNum is set. */
function readMailIndex_() {
  var raw = readRowsRaw_("mails");
  var list = [];
  var byId = {};
  raw.rows.forEach(function (r, i) {
    if (r[0] === "" || r[0] === null) return;
    var o = mailRowObject(r);
    o.rowNum = raw.rowNums[i];
    list.push(o);
    byId[o.id] = o;
  });
  return { list: list, byId: byId };
}
