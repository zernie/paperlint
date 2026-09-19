import { readdirSync, existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
const consumer = process.argv[2];
const installed = dirname(createRequire(pathToFileURL(join(consumer,"x.js")).href).resolve("research-paper-pipeline/package.json"));
const dir = join(installed, "skills");
const names = readdirSync(dir,{withFileTypes:true}).filter(d=>d.isDirectory()&&existsSync(join(dir,d.name,"SKILL.md"))).map(d=>d.name);
const tally = {c1:0,c2:0,c3:0,none:0};
const seen = new Set();
for (const name of names) {
  const body = readFileSync(join(installed,"skills",name,"SKILL.md"),"utf8");
  for (const m of body.matchAll(/([\w./-]*scripts\/[\w-]+\.mjs)/g)) {
    const raw = m[1]; seen.add(raw);
    const c1 = join(installed, raw);
    const c2 = join(installed, "skills", name, raw);
    const c3 = join(installed, raw.replace(/^\.claude\/skills\//, "skills/"));
    if (existsSync(c1)) tally.c1++;
    else if (existsSync(c2)) tally.c2++;
    else if (existsSync(c3)) tally.c3++;
    else tally.none++;
  }
}
console.log("installed dir :", installed);
console.log("skills        :", names.length);
console.log("distinct raw spellings:", [...seen].join("\n                        "));
console.log("which candidate resolved:", JSON.stringify(tally));
