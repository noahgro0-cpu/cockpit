// Loads all src/lib/*.js into one shared VM context, mirroring Apps Script's global scope.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const dir = path.join(__dirname, "..", "src", "lib");
const ctx = vm.createContext({});
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".js")).sort()) {
  vm.runInContext(fs.readFileSync(path.join(dir, f), "utf8"), ctx, { filename: f });
}
module.exports = ctx;
