// Type-checks docs/mock-state.json against shared/api-types.ts.
// The JSON is embedded as a TS literal so string literal types ("lecture", 1, ...) are checked exactly.
import { mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const json = readFileSync(join(root, "..", "docs", "mock-state.json"), "utf8");
JSON.parse(json); // fail early on invalid JSON

const tmp = join(root, ".mock-check");
mkdirSync(tmp, { recursive: true });
writeFileSync(
  join(tmp, "mock-state.check.ts"),
  `import type { State } from "../api-types";\nexport const mock = ${json.trim()} satisfies State;\n`,
);
writeFileSync(
  join(tmp, "tsconfig.json"),
  JSON.stringify({ extends: "../tsconfig.json", include: ["mock-state.check.ts"] }),
);
try {
  execFileSync(process.execPath, [join(root, "node_modules", "typescript", "bin", "tsc"), "-p", join(tmp, "tsconfig.json")], { stdio: "inherit" });
  console.log("mock-state.json matches State ✔");
} catch {
  console.error("mock-state.json does NOT match State");
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
