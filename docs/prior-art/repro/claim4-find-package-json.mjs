import module, { findPackageJSON } from "node:module";
import { pathToFileURL } from "node:url";
const consumer = process.cwd();
console.log("typeof findPackageJSON:", typeof findPackageJSON);
try { console.log("findPackageJSON('research-paper-pipeline', consumer/x.js) ->", findPackageJSON("research-paper-pipeline", pathToFileURL(consumer+"/x.js").href)); }
catch(e){ console.log("FAIL:", e.code, String(e.message).split("\n")[0]); }
try { console.log("findPackageJSON('vigiles', consumer/x.js) ->", findPackageJSON("vigiles", pathToFileURL(consumer+"/x.js").href)); }
catch(e){ console.log("vigiles FAIL:", e.code, String(e.message).split("\n")[0]); }
