/**
 * `node --import ./test/no-dist.ts …` — a process that may not load anything from `dist/`: the shape
 * of a checkout installed with `npm ci --ignore-scripts`, where `prepare` never built it. Any module
 * that resolves into `dist/` throws, naming it. Used by scripts/refresh-deadlines.test.ts to run the
 * refresh script exactly as .github/workflows/deadlines.yml does (#236 follow-up: the scheduled job
 * failed on every run from 2026-10-06 to 2026-10-19 with ERR_MODULE_NOT_FOUND dist/lib/paper-config.js).
 */
import { registerHooks } from "node:module";

/** This package's own build output — `node_modules/<pkg>/dist/` is the dependencies' and stays. */
const OWN_DIST = new URL("../dist/", import.meta.url).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    const r = nextResolve(specifier, context);
    if (r.url.startsWith(OWN_DIST))
      throw new Error(
        `resolved into dist/, which this run has not built: ${r.url} (imported from ${String(context.parentURL)})`,
      );
    return r;
  },
});
