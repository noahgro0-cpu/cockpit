const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("./load.js");

test("offset: winter +01:00, summer +02:00", () => {
  assert.equal(L.toZurichIso(new Date("2026-11-16T07:30:00Z")), "2026-11-16T08:30:00+01:00");
  assert.equal(L.toZurichIso(new Date("2026-07-01T06:30:00Z")), "2026-07-01T08:30:00+02:00");
});

test("DST start 2026-03-29 at 01:00 UTC", () => {
  assert.equal(L.toZurichIso(new Date("2026-03-29T00:59:59Z")), "2026-03-29T01:59:59+01:00");
  assert.equal(L.toZurichIso(new Date("2026-03-29T01:00:00Z")), "2026-03-29T03:00:00+02:00");
});

test("DST end 2026-10-25 at 01:00 UTC", () => {
  assert.equal(L.toZurichIso(new Date("2026-10-25T00:59:59Z")), "2026-10-25T02:59:59+02:00");
  assert.equal(L.toZurichIso(new Date("2026-10-25T01:00:00Z")), "2026-10-25T02:00:00+01:00");
});

test("local date differs from UTC date around midnight", () => {
  assert.equal(L.toZurichDate(new Date("2026-11-15T23:30:00Z")), "2026-11-16");
  assert.equal(L.toZurichDate(new Date("2026-06-30T22:30:00Z")), "2026-07-01");
});

test("zurichMidnight on normal and DST days", () => {
  assert.equal(L.zurichMidnight("2026-11-16").toISOString(), "2026-11-15T23:00:00.000Z");
  assert.equal(L.zurichMidnight("2026-07-01").toISOString(), "2026-06-30T22:00:00.000Z");
  assert.equal(L.zurichMidnight("2026-03-29").toISOString(), "2026-03-28T23:00:00.000Z");
  assert.equal(L.zurichMidnight("2026-03-30").toISOString(), "2026-03-29T22:00:00.000Z");
  assert.equal(L.zurichMidnight("2026-10-25").toISOString(), "2026-10-24T22:00:00.000Z");
  assert.equal(L.zurichMidnight("2026-10-26").toISOString(), "2026-10-25T23:00:00.000Z");
});

test("addDaysIso crosses months and years", () => {
  assert.equal(L.addDaysIso("2026-12-31", 1), "2027-01-01");
  assert.equal(L.addDaysIso("2026-03-01", -1), "2026-02-28");
});

test("ISO validation", () => {
  assert.ok(L.isIsoDate("2026-02-28"));
  assert.ok(!L.isIsoDate("2026-02-30"));
  assert.ok(!L.isIsoDate("2026-2-3"));
  assert.ok(L.isIsoDateTime("2026-11-16T08:30:00+01:00"));
  assert.ok(L.isIsoDateTime("2026-11-16T08:30Z"));
  assert.ok(!L.isIsoDateTime("2026-11-16 08:30"));
  assert.ok(!L.isIsoDateTime("2026-11-16"));
});

test("dueInstant: date means end of Zurich day", () => {
  assert.equal(L.dueInstant("2026-11-16").toISOString(), "2026-11-16T22:59:59.999Z");
  assert.equal(L.dueInstant("2026-11-16T12:00:00+01:00").toISOString(), "2026-11-16T11:00:00.000Z");
  assert.equal(L.dueInstant("nope"), null);
});

test("normalizeDateCell handles sheet Date objects", () => {
  const d = new Date("2026-11-15T23:00:00Z");
  assert.equal(L.normalizeDateCell(d, true), "2026-11-16");
  assert.equal(L.normalizeDateCell(d, false), "2026-11-16T00:00:00+01:00");
  assert.equal(L.normalizeDateCell("", true), "");
  assert.equal(L.normalizeDateCell("2026-11-16", true), "2026-11-16");
});
