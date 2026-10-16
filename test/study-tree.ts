/**
 * A paper with one study of a given mode, held in memory, and `paperlint studies <sub>` run over it
 * with stand-ins for age and git — what the tests of `seal`, `verify`, `gate` and `unseal` share.
 *
 * The stand-in sealer's "ciphertext" of `s` is `AGE[s]`, and it opens only that shape; the stand-in
 * git answers from a table of committed states, by absolute path.
 */
import { memoryFiles, memoryListDir } from "../src/adapters/memory/index.ts";
import { studyRegistryCodec } from "../src/adapters/study-registry/index.ts";
import { err, ok } from "../src/domain/result.ts";
import type { Blind, StudyMode } from "../src/domain/study-mode.ts";
import type { AbsolutePath } from "../src/domain/paths.ts";
import {
  planText,
  registryText,
  type Study,
  type StudyPlan,
} from "../src/domain/study-registry.ts";
import type { Committed, GitHistory } from "../src/ports/git-history.ts";
import type { Sealer } from "../src/ports/sealer.ts";
import { runStudies, type StudiesArgs } from "../src/studies.ts";

export const DIR = "/work/papers/example";
export const S = `${DIR}/repro/P1-S01-outcome`;
export const W = "papers/example/repro/P1-S01-outcome";
export const R1 = `age1${"q".repeat(58)}`;
export const NOW = "2026-10-16T10:00:00.000Z";
export const SHA = "f".repeat(40);
export const DATE = "2026-10-16T15:23:00+05:00";

export const BLIND: Blind = {
  kind: "blind",
  recipients: [R1],
  outputs: ["data/outcome/**", "RESULTS.md"],
  unseal_after: {
    file: "repro/P1-S01-outcome/exclusions.md",
    note: "exclusions frozen",
  },
};

export const planOf = (mode: StudyMode | undefined): StudyPlan => ({
  question: "Does the hint help?",
  population: { source: "tasks", draw: { kind: "all", method: "census" } },
  arms: [],
  primary_outcome: "pass rate",
  author_check: null,
  mode,
});

export const PLAN: StudyPlan = planOf(BLIND);

export const ROW: Study = {
  id: "P1-S01",
  folder: "P1-S01-outcome",
  title: "Outcome",
  question: "q?",
  kind: "measurement",
  status: "running",
  date: "2026-10-01",
  in_paper: "no",
  plan: "plan.json",
};

/** A paper with the study, its plan, and `extra`. */
export const tree = (
  extra: Readonly<Record<string, string>> = {},
  plan: StudyPlan = PLAN,
  row: Study = ROW,
): Record<string, string> => ({
  [`${DIR}/PIPELINE-STATUS.md`]: "# status\n",
  [`${DIR}/repro/studies.json`]: registryText({ prefix: "P1", studies: [row] }),
  [`${S}/README.md`]: "# outcome\n",
  [`${S}/plan.json`]: planText(plan),
  ...extra,
});

export const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
const dec = (b: Uint8Array): string => new TextDecoder().decode(b);

/** The stand-in's ciphertext of `s`. */
export const sealedText = (s: string): string => `AGE[${s}]`;

/** What the stand-in sealer does: work, or fail as told. */
export type SealerScript = "works" | "missing" | "failed";

/** A sealer over `files`: seals by wrapping, opens what it wrapped, or fails as told. */
const fakeSealer = (
  script: SealerScript,
  read: (p: AbsolutePath) => Uint8Array | null,
): Sealer => {
  const fail =
    script === "missing"
      ? err({ kind: "missing" } as const)
      : err({ kind: "failed", message: "bad recipient" } as const);
  return {
    seal: (_r, p) => (script === "works" ? ok(enc(sealedText(dec(p)))) : fail),
    unseal: (_identity, at) => {
      const text = dec(read(at) ?? new Uint8Array());
      const m = /^AGE\[([\s\S]*)\]$/u.exec(text);
      if (script !== "works") return fail;
      return m === null
        ? err({
            kind: "failed",
            message: "no identity matched any of the recipients",
          })
        : ok(enc(String(m[1])));
    },
  };
};

/** git answering from `table` (absolute path → state); a path not in it was never committed. */
export const fakeGit = (
  table: Readonly<Record<string, Committed>>,
): GitHistory & { readonly asked: string[] } => {
  const asked: string[] = [];
  return {
    asked,
    committed: (_paper, file) => {
      asked.push(file);
      return table[file] ?? { kind: "not-committed" };
    },
  };
};

/** `studies <sub> papers/example <id>` over `t`: the exit code, what it printed, and the files after. */
export function studies(
  sub: string,
  t: Readonly<Record<string, string>>,
  over: Partial<StudiesArgs> = {},
  o: {
    readonly sealer?: SealerScript;
    readonly git?: Readonly<Record<string, Committed>>;
  } = {},
) {
  const files = memoryFiles(t);
  const log: string[] = [];
  const errs: string[] = [];
  const code = runStudies(
    {
      sub,
      paperDir: "papers/example",
      title: "P1-S01",
      extra: [],
      kind: null,
      identity: null,
      ...over,
    },
    {
      files,
      listDir: memoryListDir(files),
      codec: studyRegistryCodec,
      cwd: "/work",
      today: "2026-10-16",
      now: NOW,
      sealer: fakeSealer(o.sealer ?? "works", (p) => files.readBytes(p)),
      git: fakeGit(o.git ?? {}),
      remove: (p) => void files.map.delete(p),
      log: (l) => log.push(l),
      err: (l) => errs.push(l),
    },
  );
  const after = Object.fromEntries([...files.map].map(([k, v]) => [k, dec(v)]));
  return { code, log, err: errs, after };
}
