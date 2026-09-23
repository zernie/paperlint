import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
const NAME = "research-paper-pipeline";
const consumer = process.argv[2];
console.log("running from:", import.meta.url);
// 1) bare, from a dir that does NOT have the package
try { console.log("  import.meta.resolve(pkg/package.json) 1-arg ->", import.meta.resolve(`${NAME}/package.json`)); }
catch (e) { console.log("  1-arg FAIL:", e.code, String(e.message).split("\n")[0]); }
// 2) with an explicit parent inside the consumer
try { console.log("  import.meta.resolve(..., parent=consumer) ->", import.meta.resolve(`${NAME}/package.json`, pathToFileURL(consumer + "/x.mjs").href)); }
catch (e) { console.log("  2-arg FAIL:", e.code, String(e.message).split("\n")[0]); }
// 3) require.resolve with paths:
try { console.log("  require.resolve(..., {paths:[consumer]}) ->", createRequire(import.meta.url).resolve(`${NAME}/package.json`, { paths: [consumer] })); }
catch (e) { console.log("  paths: FAIL:", e.code, String(e.message).split("\n")[0]); }
// 4) createRequire anchored at the consumer
try { console.log("  createRequire(consumer/x.js).resolve(...) ->", createRequire(pathToFileURL(consumer + "/x.js").href).resolve(`${NAME}/package.json`)); }
catch (e) { console.log("  anchored FAIL:", e.code, String(e.message).split("\n")[0]); }
