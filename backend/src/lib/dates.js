/**
 * Date helpers for Europe/Zurich without Intl or Apps Script globals.
 * Zurich follows the EU rule: CEST (+02:00) from the last Sunday of March 01:00 UTC
 * until the last Sunday of October 01:00 UTC, otherwise CET (+01:00).
 */

var MS_PER_MIN = 60000;
var MS_PER_DAY = 86400000;

function lastSundayUtc_(year, month) {
  var last = new Date(Date.UTC(year, month + 1, 0));
  return Date.UTC(year, month, last.getUTCDate() - last.getUTCDay(), 1, 0, 0);
}

/** Offset of Europe/Zurich from UTC in minutes (60 or 120) at the given instant. */
function zurichOffsetMinutes(date) {
  var t = date.getTime();
  var y = date.getUTCFullYear();
  return t >= lastSundayUtc_(y, 2) && t < lastSundayUtc_(y, 9) ? 120 : 60;
}

function pad2_(n) {
  return (n < 10 ? "0" : "") + n;
}

function offsetString_(minutes) {
  return "+" + pad2_(Math.floor(minutes / 60)) + ":" + pad2_(minutes % 60);
}

/** "2026-11-16T08:30:00+01:00" */
function toZurichIso(date) {
  var off = zurichOffsetMinutes(date);
  var d = new Date(date.getTime() + off * MS_PER_MIN);
  return (
    d.getUTCFullYear() + "-" + pad2_(d.getUTCMonth() + 1) + "-" + pad2_(d.getUTCDate()) +
    "T" + pad2_(d.getUTCHours()) + ":" + pad2_(d.getUTCMinutes()) + ":" + pad2_(d.getUTCSeconds()) +
    offsetString_(off)
  );
}

/** Calendar date in Zurich: "2026-11-16" */
function toZurichDate(date) {
  return toZurichIso(date).slice(0, 10);
}

/** Instant of 00:00 Zurich time on the given ISODate. */
function zurichMidnight(isoDate) {
  var p = isoDate.split("-");
  var guess = Date.UTC(+p[0], +p[1] - 1, +p[2]) - 60 * MS_PER_MIN;
  var off = zurichOffsetMinutes(new Date(guess));
  return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]) - off * MS_PER_MIN);
}

/** Adds whole days to an ISODate string. */
function addDaysIso(isoDate, days) {
  var p = isoDate.split("-");
  var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + days));
  return d.getUTCFullYear() + "-" + pad2_(d.getUTCMonth() + 1) + "-" + pad2_(d.getUTCDate());
}

function isIsoDate(s) {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  var p = s.split("-");
  var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
  return d.getUTCFullYear() === +p[0] && d.getUTCMonth() === +p[1] - 1 && d.getUTCDate() === +p[2];
}

function isIsoDateTime(s) {
  if (typeof s !== "string") return false;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(s)) return false;
  return isIsoDate(s.slice(0, 10)) && !isNaN(Date.parse(s));
}

/**
 * Instant used for sorting/comparing a due value: ISODateTime as is,
 * ISODate as end of that Zurich day (23:59:59.999).
 */
function dueInstant(due) {
  if (isIsoDateTime(due)) return new Date(Date.parse(due));
  if (isIsoDate(due)) return new Date(zurichMidnight(addDaysIso(due, 1)).getTime() - 1);
  return null;
}

/** Normalises a value read from a sheet cell (Date object or string) to an ISO string or "". */
function normalizeDateCell(value, dateOnly) {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "object" && typeof value.getTime === "function") {
    return dateOnly ? toZurichDate(value) : toZurichIso(value);
  }
  return String(value);
}
