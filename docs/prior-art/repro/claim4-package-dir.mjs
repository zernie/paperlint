import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, relative } from "node:path";
import { lstatSync, readlinkSync, readFileSync, existsSync, realpathSync } from "node:fs";
const req = createRequire(import.meta.url);
const NAME = "research-paper-pipeline";

const pkgJson = req.resolve(`${NAME}/package.json`);
const pkgDir  = dirname(pkgJson);
console.log("resolved package.json :", pkgJson);
console.log("=> package dir        :", pkgDir);

const literal = join(process.cwd(), "node_modules", NAME);
console.log("literal node_modules/ :", literal);
console.log("   exists?            :", existsSync(literal));
if (existsSync(literal)) {
  const st = lstatSync(literal);
  console.log("   isSymbolicLink?    :", st.isSymbolicLink(), st.isSymbolicLink() ? "-> " + readlinkSync(literal) : "");
  console.log("   realpath           :", realpathSync(literal));
  console.log("   SAME as resolved?  :", realpathSync(literal) === realpathSync(pkgDir));
}

// the manifest itself: main / exports / bin
const man = JSON.parse(readFileSync(pkgJson, "utf8"));
console.log("manifest.main    :", JSON.stringify(man.main));
console.log("manifest.exports :", JSON.stringify(man.exports));
console.log("manifest.bin     :", JSON.stringify(man.bin));
console.log("bin from manifest:", join(pkgDir, man.bin.rpp), existsSync(join(pkgDir, man.bin.rpp)) ? "EXISTS" : "MISSING");

// two-arg import.meta.resolve (the parent form)
try { console.log("import.meta.resolve(spec, parent):", import.meta.resolve(`${NAME}/package.json`, pathToFileURL(process.cwd() + "/x.js").href)); }
catch (e) { console.log("import.meta.resolve(spec,parent) FAIL:", e.code, String(e.message).split("\n")[0]); }

// resolve vigiles FROM INSIDE the installed package (what cli.ts does)
const inside = createRequire(pathToFileURL(join(pkgDir, "dist", "cli.js")).href);
for (const spec of ["vigiles", "vigiles/package.json"]) {
  try { console.log(`from inside pkg: resolve(${spec}) ->`, inside.resolve(spec)); }
  catch (e) { console.log(`from inside pkg: resolve(${spec}) FAIL:`, e.code, String(e.message).split("\n")[0]); }
}
