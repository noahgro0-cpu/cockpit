const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("./load.js");
const plain = (o) => JSON.parse(JSON.stringify(o));

test("settings.update validation", () => {
  const ok = (p) => L.validateSettingsUpdate(p).ok;
  assert.equal(ok({ homeStop: "Dorf, Post" }), true);
  assert.equal(ok({ lat: 47.1, lon: 8.5 }), true);
  assert.equal(ok({}), false);
  assert.equal(ok({ lat: "47" }), false);
  assert.equal(ok({ lat: 91 }), false);
  assert.equal(ok({ apiKey: "x" }), false);
  assert.equal(ok({ homeStop: "x".repeat(101) }), false);
  const cat = { id: "math", label: "Mathe", color: "#AABBCC", group: "schule" };
  assert.equal(ok({ categories: [cat] }), true);
  assert.equal(ok({ categories: [cat, cat] }), false, "duplicate id");
  assert.equal(ok({ categories: [Object.assign({}, cat, { color: "red" })] }), false);
  assert.equal(ok({ categories: [Object.assign({}, cat, { group: "x" })] }), false);
});

test("settings.update -> config pairs", () => {
  const pairs = plain(L.settingsToConfigPairs({ homeStop: " A ", lat: 47.5, categories: [{ id: "a", label: " A ", color: "#000000", group: "privat", extra: 1 }] }));
  assert.deepEqual(pairs, [["homeStop", "A"], ["lat", "47.5"], ["categories", '[{"id":"a","label":"A","color":"#000000","group":"privat"}]']]);
});

test("quickAdd accepts an optional id, settings.update is a write action", () => {
  assert.equal(L.validateQuickAdd({ text: "x" }).ok, true);
  assert.equal(L.validateQuickAdd({ text: "x", id: "9b2f-uuid" }).ok, true);
  assert.equal(L.validateQuickAdd({ text: "x", id: "bad id" }).ok, false);
  const a = L.apiActions_();
  assert.equal(a["settings.update"].write, true);
  assert.equal(a.quickAdd.write, false, "quickAdd locks itself around the write");
});
