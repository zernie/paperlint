/**
 * Running `paperlint build` in an e2e test: the TeX Live the run will use, and the build itself,
 * in-process, over fake citation services. Shared by every e2e file that builds a real PDF.
 *
 * Named without `.e2e.ts`, so the e2e projects' glob does not take it for a test file.
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
// `run` is what `bin/paperlint.mjs` re-exports; imported from the build it re-exports, which has types.
import { run } from "../../../dist/cli.js";
import type { referencesChecker } from "../../../dist/adapters/references/index.js";

const ROOT = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));
const CLI = join(ROOT, "bin", "paperlint.mjs");

/** The TeX Live the real run will use, as `build --dry-run` names it. */
export function engineIn(work: string): string {
  const plan = spawnSync(
    process.execPath,
    [CLI, "build", "--all", "--dry-run"],
    { cwd: work, encoding: "utf8", env: { ...process.env, CI: "1" } },
  );
  return plan.stdout.split("\n").find((l) => l.startsWith("engine: ")) ?? "";
}

/** The (fake) citation services a build asks: what it asked them, and the checker over them. */
export interface Services {
  readonly asked: string[];
  readonly checkReferences: ReturnType<typeof referencesChecker>;
}

/**
 * 🔴 NO LIVE CITATION SERVICE. The references step asks Crossref, OpenAlex, Semantic Scholar,
 * arXiv and DBLP; a run that depended on them took ~9 minutes and failed when DBLP did. The build
 * runs in-process through the CLI's own composition root, `run()`, with the REAL references
 * adapter over a fake `fetch` that answers every service and counts what it was asked — so the
 * lookup cache, the reachability probe and DBLP's pacing are the shipped ones. Everything else
 * is the real command: real pdflatex and bibtex.
 */
function fakeServices(asked: string[]): typeof fetch {
  return (url: string | URL | Request) => {
    const u = url instanceof Request ? url.url : String(url);
    asked.push(u);
    if (u.startsWith("https://export.arxiv.org/"))
      return Promise.resolve(new Response("<feed></feed>"));
    if (u.startsWith("https://dblp.org/"))
      return Promise.resolve(Response.json({}));
    return Promise.resolve(
      Response.json({ message: { items: [] }, results: [], data: [] }),
    );
  };
}

/** `paperlint build <args>` in-process, over the fake services; what it printed and returned. */
export async function buildIn(
  work: string,
  args: readonly string[],
  services: Services,
): Promise<{ status: number; out: string }> {
  const realFetch = globalThis.fetch;
  globalThis.fetch = fakeServices(services.asked);
  const printed: string[] = [];
  const say = (...a: unknown[]) => printed.push(a.join(" "));
  try {
    const status = await run(["build", ...args], {
      cwd: work,
      log: say,
      err: say,
      checkReferences: services.checkReferences,
    });
    return { status, out: printed.join("\n") };
  } finally {
    globalThis.fetch = realFetch;
  }
}
