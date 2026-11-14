// Checks that hold for the whole Apps Script project (all files share one global scope).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const src = path.join(__dirname, "..", "src");
const files = [];
(function walk(dir) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) walk(p);
    else if (f.name.endsWith(".js")) files.push(p);
  }
})(src);

test("every source file parses", () => {
  for (const f of files) assert.doesNotThrow(() => new vm.Script(fs.readFileSync(f, "utf8"), { filename: f }), f);
});

test("no global name is defined twice across files", () => {
  const seen = new Map();
  for (const f of files) {
    const code = fs.readFileSync(f, "utf8");
    for (const m of code.matchAll(/^(?:function\s+([A-Za-z0-9_$]+)|var\s+([A-Za-z0-9_$]+))/gm)) {
      const name = m[1] || m[2];
      assert.ok(!seen.has(name), `${name} defined in ${seen.get(name)} and ${path.basename(f)}`);
      seen.set(name, path.basename(f));
    }
  }
});

test("all project files load together and expose the trigger and web app entry points", () => {
  const ctx = vm.createContext({});
  for (const f of files) vm.runInContext(fs.readFileSync(f, "utf8"), ctx, { filename: f });
  for (const fn of ["doPost", "doGet", "setup", "rotateKey", "tick", "sendTestNotification", "diagnoseNtfy"]) assert.equal(typeof ctx[fn], "function", fn);
});

test("manifest: time zone, V8, narrow scopes, web app settings", () => {
  const m = JSON.parse(fs.readFileSync(path.join(src, "appsscript.json"), "utf8"));
  assert.equal(m.timeZone, "Europe/Zurich");
  assert.equal(m.runtimeVersion, "V8");
  assert.ok(!m.oauthScopes.includes("https://mail.google.com/"), "full Gmail scope must not be requested");
  assert.deepEqual(m.webapp, { executeAs: "USER_DEPLOYING", access: "ANYONE_ANONYMOUS" });
});
