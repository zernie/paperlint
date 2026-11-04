// The shape of `install` in every result run.mjs writes, declared once. install-result.schema.json beside it is
// generated from this (node frame/rule-proof/install-schema.mjs --write) and the selftest fails when they differ, so
// a reader in another language validates against the same declaration.
//
// A failure's `cause` is a closed list, decided only from structured signals: which files exist, parsed
// package.json and lockfiles, exit status, npm's --json error code. `detail` is free text kept for a person; no code
// reads it. `unknown` is a legal cause: it is counted and printed, never filled in from `detail`.
import { writeFileSync } from "node:fs";
import { z } from "zod";

export const CAUSES = [
  "no-lockfile", // no Node lockfile at the root: the version would not be the repository's
  "no-pin", // Ruff: no exact pin in a lockfile, requirements, pyproject.toml or pre-commit
  "no-linter-dependency", // the install ran and no package.json of the repository declares ESLint
  "linter-in-subpackage", // the install ran; ESLint is declared only in a package below the root
  "node-engine", // the root package.json's engines.node excludes the Node the job ran
  "submodule", // the repository has a .pnpmfile and .gitmodules (an install-time hook that fetches submodules)
  "peer-conflict-typescript", // npm ERESOLVE that dropping the explicit TypeScript resolved
  "peer-conflict-other", // npm ERESOLVE otherwise
  "package-not-found", // the registry has no such package or version (HTTP 404, npm E404 / ETARGET)
  "tool-resolve", // Ruff: the pre-commit rev the kit read is not a release, and no other root file pins Ruff
  "registry-or-network", // the registry or the network failed (fetch threw, npm ENOTFOUND / ECONNRESET / ETIMEDOUT / EAI_AGAIN / ECONNREFUSED)
  "timeout", // a step ran past its time limit
  "unknown", // none of the structured signals decides it
];
export const STAGES = ["clone", "detect", "resolve", "fetch", "load"];
export const PATHS = ["as-designed", "lockfile-pinned", "date-matched"];

const failure = z.strictObject({
  stage: z.enum(STAGES),
  cause: z.enum(CAUSES),
  tool: z.strictObject({ cmd: z.string(), exit: z.number().int().nullable(), code: z.string().nullable() }).optional(),
  detail: z.string(),
});
const plugin = z.strictObject({
  version: z.string().nullable(),
  error: z.string().nullable(),
  cause: z.enum(CAUSES).optional(),
  peer_conflict: z.boolean().optional(),
});
const attempt = z.strictObject({
  path: z.enum(PATHS),
  outcome: z.enum(["installed", "not-installed"]),
  rule: z.enum(["ruff-date-matched"]).optional(),
  failure: failure.optional(),
  resolved: z.array(z.strictObject({ cause: z.enum(CAUSES), by: z.string() })).optional(),
});
export const installSchema = z.strictObject({
  outcome: z.enum(["installed", "not-installed"]),
  path: z.enum(PATHS).nullable(),
  version: z.string().nullable(),
  versions: z.record(z.string(), z.string()),
  plugins: z.record(z.string(), plugin),
  attempts: z.array(attempt).min(1),
  adjustments: z.array(z.string()),
  commit: z.string().optional(),
  repo_eslint: z.strictObject({ declared: z.array(z.string()), package_jsons: z.number().int() }).optional(),
  lockfile_pinned: z.strictObject({ package: z.string(), lockfile: z.string(), candidates: z.array(z.string()) }).optional(),
  date_matched: z.strictObject({ commit: z.string(), ruff: z.string() }).optional(),
  aside: z.array(z.string()).optional(),
  legacy_peer_deps: z.boolean().optional(),
  typescript_peer_resolved: z.boolean().optional(),
}).superRefine((v, ctx) => {
  const last = v.attempts.at(-1);
  if (last.outcome !== v.outcome) ctx.addIssue({ code: "custom", message: "outcome is the last attempt's" });
  if ((v.outcome === "installed") !== (v.path !== null)) ctx.addIssue({ code: "custom", message: "path set exactly when installed" });
  for (const a of v.attempts) if ((a.outcome === "not-installed") !== (a.failure !== undefined)) ctx.addIssue({ code: "custom", message: "an attempt has a failure exactly when it did not install" });
});

export const jsonSchema = () => ({ $comment: "generated from install-schema.mjs; do not edit", ...z.toJSONSchema(installSchema, { io: "input" }) });

if (process.argv[2] === "--write") {
  writeFileSync(new URL("./install-result.schema.json", import.meta.url), JSON.stringify(jsonSchema(), null, 1) + "\n");
}
