#!/usr/bin/env node
/**
 * corpus-licences — for each paper of a venue corpus and each kind (text, PDF), the copy whose
 * licence permits keeping it, or why none does (`corpus-licences-core.ts`); this file only runs it.
 * A consumer runs the compiled `corpus-licences.js` (Node strips no types under node_modules).
 *
 * Usage: node corpus-licences.js <venue>
 */
import { nodeFiles, spawnProcess } from "#src/adapters/node/index";
import { callerPath } from "#src/caller-path";
import { venueCorpusCodec } from "#src/adapters/venue-corpus/index";
import { main } from "./corpus-licences-core.ts";

const git = spawnProcess();

/** `git rev-parse --show-toplevel` in `cwd`: the project's root, or null outside a repository. */
function projectRoot(cwd: string): string | null {
  const r = git.run({
    file: "git",
    args: ["rev-parse", "--show-toplevel"],
    env: { PATH: process.env["PATH"] ?? "" },
    timeoutMs: 10_000,
    cwd: callerPath(cwd),
  });
  const top = r.kind === "exited" && r.status === 0 ? r.stdout.trim() : "";
  return top === "" ? null : top;
}

process.exitCode = main(
  process.argv.slice(2),
  {
    files: nodeFiles,
    codec: venueCorpusCodec,
    projectRoot,
    cwd: process.cwd(),
  },
  {
    out: (s) => process.stdout.write(s),
    err: (s) => process.stderr.write(s),
  },
);
