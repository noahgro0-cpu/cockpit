const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("./load.js");
const plain = (o) => JSON.parse(JSON.stringify(o));

const KEY = "k".repeat(64);
function deps(over = {}) {
  const d = {
    apiKey: KEY, fails: 0, locked: 0, errors: [],
    authFailures() { return d.fails; },
    registerAuthFailure() { d.fails++; },
    withLock(fn) { d.locked++; return fn(); },
    onError(e) { d.errors.push(e); },
    handlers: { ping: () => ({ time: "t" }), "todo.delete": (p) => ({ id: p.id }) },
  };
  return Object.assign(d, over);
}
const call = (body, d) => plain(L.handleApiRequest(typeof body === "string" ? body : JSON.stringify(body), d));

test("ping succeeds with the right key", () => {
  assert.deepEqual(call({ key: KEY, action: "ping" }, deps()), { ok: true, data: { time: "t" } });
});

test("broken JSON and non-object bodies are bad_request", () => {
  assert.equal(call("{not json", deps()).error.code, "bad_request");
  assert.equal(call("[1,2]", deps()).error.code, "bad_request");
  assert.equal(call("", deps()).error.code, "bad_request");
});

test("wrong or missing key is unauthorized and counted", () => {
  const d = deps();
  assert.equal(call({ key: "x", action: "ping" }, d).error.code, "unauthorized");
  assert.equal(call({ action: "ping" }, d).error.code, "unauthorized");
  assert.equal(d.fails, 2);
});

test("after 10 failures even the right key is refused without checking", () => {
  const d = deps({ fails: 10 });
  assert.equal(call({ key: KEY, action: "ping" }, d).error.code, "unauthorized");
  assert.equal(d.fails, 10);
});

test("empty server key never authorizes", () => {
  assert.equal(call({ key: "", action: "ping" }, deps({ apiKey: "" })).error.code, "unauthorized");
});

test("unknown actions, prototype keys and invalid payloads are bad_request", () => {
  assert.equal(call({ key: KEY, action: "nope" }, deps()).error.code, "bad_request");
  assert.equal(call({ key: KEY, action: "constructor" }, deps()).error.code, "bad_request");
  assert.equal(call({ key: KEY, action: "todo.delete", payload: { id: "a b" } }, deps()).error.code, "bad_request");
  assert.equal(call({ key: KEY, action: "ping", payload: "x" }, deps()).error.code, "bad_request");
});

test("known action without handler reports not available", () => {
  const r = call({ key: KEY, action: "mail.dismiss", payload: { id: "m1" } }, deps());
  assert.equal(r.error.code, "bad_request");
  assert.match(r.error.message, /not available/);
});

test("write actions run under the lock, reads do not", () => {
  const d = deps();
  assert.deepEqual(call({ key: KEY, action: "todo.delete", payload: { id: "a1" } }, d), { ok: true, data: { id: "a1" } });
  assert.equal(d.locked, 1);
  call({ key: KEY, action: "ping" }, d);
  assert.equal(d.locked, 1);
});

test("apiError passes through; other exceptions become internal and are logged", () => {
  const d = deps({
    handlers: {
      ping: () => { throw L.apiError("not_found", "Todo not found"); },
      getState: () => { throw new Error("boom"); },
    },
  });
  assert.deepEqual(call({ key: KEY, action: "ping" }, d), { ok: false, error: { code: "not_found", message: "Todo not found" } });
  assert.deepEqual(call({ key: KEY, action: "getState" }, d), { ok: false, error: { code: "internal", message: "Internal error" } });
  assert.equal(d.errors.length, 1);
});

test("busy lock surfaces as busy", () => {
  const d = deps({ withLock() { throw L.apiError("busy", "Try again"); } });
  assert.equal(call({ key: KEY, action: "todo.delete", payload: { id: "a1" } }, d).error.code, "busy");
});

test("event.add validation", () => {
  const ok = { calendar: "exams", title: "Pruefung", date: "2027-01-19", kind: "exam" };
  assert.ok(L.validateEventAdd(ok).ok);
  assert.ok(!L.validateEventAdd({ ...ok, calendar: "private" }).ok);
  assert.ok(!L.validateEventAdd({ ...ok, date: "2027-02-30" }).ok);
  assert.ok(!L.validateEventAdd({ ...ok, kind: "lecture" }).ok);
  assert.ok(!L.validateEventAdd({ ...ok, title: "" }).ok);
});

test("safeEqual", () => {
  assert.ok(L.safeEqual("abc", "abc"));
  assert.ok(!L.safeEqual("abc", "abd"));
  assert.ok(!L.safeEqual("abc", "ab"));
  assert.ok(!L.safeEqual(undefined, "ab"));
});
