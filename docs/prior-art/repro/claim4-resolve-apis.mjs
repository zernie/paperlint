import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const req = createRequire(import.meta.url);
const NAME = "research-paper-pipeline";
const tries = [
  ["createRequire.resolve('<pkg>/package.json')", () => req.resolve(`${NAME}/package.json`)],
  ["createRequire.resolve('<pkg>')",              () => req.resolve(NAME)],
  ["createRequire.resolve('<pkg>/bin/rpp.mjs')",  () => req.resolve(`${NAME}/bin/rpp.mjs`)],
  ["require.resolve(name,{paths:[cwd]}) pkg.json",() => req.resolve(`${NAME}/package.json`, { paths: [process.cwd()] })],
  ["import.meta.resolve('<pkg>/package.json')",   () => fileURLToPath(import.meta.resolve(`${NAME}/package.json`))],
  ["import.meta.resolve('<pkg>')",                () => fileURLToPath(import.meta.resolve(NAME))],
  // the closed-exports control: vigiles is a dep OF the package, exports map is closed
  ["createRequire.resolve('vigiles/package.json')", () => req.resolve("vigiles/package.json")],
  ["createRequire.resolve('vigiles')",              () => req.resolve("vigiles")],
  ["createRequire.resolve('vigiles/dist/cli.js')",  () => req.resolve("vigiles/dist/cli.js")],
];
console.log(`node ${process.version}  cwd=${process.cwd()}`);
for (const [label, fn] of tries) {
  try { console.log(`  OK   ${label}\n         -> ${fn()}`); }
  catch (e) { console.log(`  FAIL ${label}\n         ${e.code ?? ""} ${String(e.message).split("\n")[0]}`); }
}
