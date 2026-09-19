import { readdirSync, existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
const installed = process.argv[2];
const dir = join(installed,"skills");
const names = readdirSync(dir,{withFileTypes:true}).filter(d=>d.isDirectory()&&existsSync(join(dir,d.name,"SKILL.md"))).map(d=>d.name);
let amb=0, tot=0;
const kinds={};
for (const name of names){
  const body=readFileSync(join(installed,"skills",name,"SKILL.md"),"utf8");
  for(const m of body.matchAll(/([\w./-]*scripts\/[\w-]+\.mjs)/g)){
    tot++; const raw=m[1];
    const hits=[["c1",join(installed,raw)],["c2",join(installed,"skills",name,raw)],["c3",join(installed,raw.replace(/^\.claude\/skills\//,"skills/"))]].filter(([,p])=>existsSync(p)).map(([k])=>k);
    if(hits.length>1){amb++; if(amb<6)console.log("AMBIGUOUS:",name,raw,hits.join("+"));}
    kinds[hits.join("+")||"none"]=(kinds[hits.join("+")||"none"]??0)+1;
  }
}
console.log("total refs",tot,"ambiguous",amb, JSON.stringify(kinds));
