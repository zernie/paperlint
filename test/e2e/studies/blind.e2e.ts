/**
 * A blind study sealed with the real age, through the real binary (`bin/paperlint.mjs`), in a project
 * in a scratch directory: a throwaway key pair from `age-keygen`, a runner's plaintext results, and
 * every promise of `studies seal|verify` and `repro/blind-plaintext` (docs/design/sealed-studies.md):
 *
 *   - the lint reports each planted plaintext, and is silent once sealed;
 *   - what is sealed decrypts, with the private key and only with age, to the bytes the manifest hashed;
 *   - a re-run is idempotent, a changed result is refused and nothing written;
 *   - verify, with no key, passes on the sealed tree and names a swapped ciphertext;
 *   - without age on PATH, seal stops with the install hint.
 *
 *   - unseal is refused until the decision is committed in a real git repository, then writes the
 *     very bytes sealed and records the gate's commit; verify and the lint are then clean.
 *
 *   npm run test:e2e:age
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { z } from "zod";
import {
  planTemplate,
  planText,
  registryText,
  withIndex,
  type StudyRegistry,
} from "../../../dist/domain/study-registry.js";
import { missing } from "../need.ts";
import { commit, initRepo } from "../../git-repo.ts";

const ROOT = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));
const BIN = join(ROOT, "bin", "paperlint.mjs");

const has = (program: string): boolean =>
  spawnSync(program, ["--version"], { encoding: "utf8" }).status === 0;

/** Run `program` with `args`: status, stdout, stderr. */
const sh = (
  program: string,
  args: readonly string[],
  o: { cwd?: string; env?: NodeJS.ProcessEnv; input?: Uint8Array } = {},
) => {
  const r = spawnSync(program, [...args], { ...o, maxBuffer: 1 << 26 });
  return {
    status: r.status,
    stdout: r.stdout,
    out: r.stdout.toString("utf8"),
    err: r.stderr.toString("utf8"),
  };
};

const sha = (b: Uint8Array | string): string =>
  createHash("sha256").update(b).digest("hex");

const dir = realpathSync(mkdtempSync(join(tmpdir(), "paperlint-sealed-e2e-")));
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

const P = join(dir, "papers", "example");
const S = join(P, "repro", "P1-S01-outcome");
const at = (rel: string): string => join(S, rel);

/** `paperlint <args>` from the project, with `env` (default: this process's). */
const paperlint = (args: readonly string[], env = process.env) =>
  sh(process.execPath, [BIN, ...args], { cwd: dir, env });

const LintReport = z.array(
  z.object({
    messages: z.array(
      z.object({ ruleId: z.string().nullable(), message: z.string() }),
    ),
  }),
);

const UnsealedManifest = z.object({
  unsealed: z.object({
    gate: z.object({ file: z.string(), commit: z.string(), date: z.string() }),
  }),
});

const Manifest = z.object({
  files: z.array(
    z.object({
      path: z.string(),
      sha256: z.string(),
      size: z.number(),
      age_sha256: z.string(),
    }),
  ),
});

/** The repro/blind-plaintext messages of `paperlint lint --json`. */
const blindFindings = (): readonly string[] => {
  const r = paperlint(["lint", "--json"]);
  const report = LintReport.parse(JSON.parse(r.out));
  return report.flatMap((f) =>
    f.messages
      .filter((m) => m.ruleId === "repro/blind-plaintext")
      .map((m) => m.message.split("\n")[0] ?? ""),
  );
};

/** Skipped without age; under CI a failure naming it (test/e2e/need.ts). */
const SKIP = missing(
  "age and age-keygen",
  has("age") && has("age-keygen"),
  "install age: apt install age, brew install age, or https://github.com/FiloSottile/age/releases",
);

/** The private key, outside the project: it is never committed. */
const key = join(
  realpathSync(mkdtempSync(join(tmpdir(), "paperlint-sealed-key-"))),
  "key.txt",
);
const RESULTS = "41 of 60 pass\n";
const CSV = new Uint8Array(Array.from({ length: 300 }, (_, i) => i % 256));

describe.skipIf(SKIP)("a blind study sealed with the real age — set up", () => {
  it("sets up: a key pair, a project, a blind study, a runner's results", () => {
    expect(sh("age-keygen", ["-o", key]).status).toBe(0);
    const recipient = sh("age-keygen", ["-y", key]).out.trim();
    const registry: StudyRegistry = {
      prefix: "P1",
      studies: [
        {
          id: "P1-S01",
          folder: "P1-S01-outcome",
          title: "Outcome",
          question: "Does the hint help?",
          kind: "measurement",
          status: "designing",
          date: "2026-10-16",
          in_paper: "no",
          plan: "plan.json",
        },
      ],
    };
    const files: Readonly<Record<string, string | Uint8Array>> = {
      "package.json": "{}\n",
      "papers/example/PIPELINE-STATUS.md": "---\nstages: []\n---\n# status\n",
      "papers/example/paper.tex":
        "\\documentclass{article}\n\\begin{document}\nx\n\\end{document}\n",
      "papers/example/repro/studies.json": registryText(registry),
      "papers/example/repro/README.md": withIndex("# repro\n", registry),
      "papers/example/repro/P1-S01-outcome/README.md": "# outcome\n",
      "papers/example/repro/P1-S01-outcome/plan.json": planText({
        ...planTemplate("measurement", "P1-S01-outcome"),
        mode: {
          kind: "blind",
          recipients: [recipient],
          outputs: ["data/outcome/**", "RESULTS.md"],
          unseal_after: {
            file: "repro/P1-S01-outcome/exclusions.md",
            note: "exclusions frozen",
          },
        },
      }),
      "papers/example/repro/P1-S01-outcome/RESULTS.md": RESULTS,
      "papers/example/repro/P1-S01-outcome/data/outcome/a.bin": CSV,
    };
    Object.entries(files).forEach(([rel, body]) => {
      const p = join(dir, rel);
      sh("mkdir", ["-p", dirname(p)]);
      writeFileSync(p, body);
    });
    // Guards: the recipient is the one age-keygen derived from the key, so the seal targets it.
    expect(recipient).toMatch(/^age1[02-9ac-hj-np-z]{58}$/u);
  });
});

describe.skipIf(SKIP)(
  "a blind study sealed with the real age — sealing",
  () => {
    it("the lint reports each planted plaintext", () => {
      // Guards: loud on each defect — one finding per plaintext result.
      expect(blindFindings()).toEqual([
        "`repro/P1-S01-outcome/RESULTS.md` is a plaintext result of the blind study `P1-S01`, which is still sealed: its plan's `mode.outputs` match it, and its `sealed.json` does not say unsealed. What to do: run `npx paperlint studies seal <paper-dir> P1-S01` — it encrypts the file to the plan's recipients and removes the plaintext. Never read it first.",
        "`repro/P1-S01-outcome/data/outcome/a.bin` is a plaintext result of the blind study `P1-S01`, which is still sealed: its plan's `mode.outputs` match it, and its `sealed.json` does not say unsealed. What to do: run `npx paperlint studies seal <paper-dir> P1-S01` — it encrypts the file to the plan's recipients and removes the plaintext. Never read it first.",
      ]);
    });

    it("seal encrypts both, records their hashes, removes the plaintexts; the lint is then silent", () => {
      const r = paperlint(["studies", "seal", "papers/example", "P1-S01"]);
      const manifest = Manifest.parse(
        JSON.parse(readFileSync(at("sealed.json"), "utf8")),
      );
      // Guards: exit 0, the plaintexts gone, the record holding the plaintexts' and ciphertexts' hashes.
      expect({ status: r.status, err: r.err }).toEqual({ status: 0, err: "" });
      expect([
        existsSync(at("RESULTS.md")),
        existsSync(at("data/outcome/a.bin")),
      ]).toEqual([false, false]);
      expect(
        manifest.files.map((f) => [f.path, f.sha256, f.size, f.age_sha256]),
      ).toEqual([
        [
          "RESULTS.md",
          sha(RESULTS),
          RESULTS.length,
          sha(readFileSync(at("RESULTS.md.age"))),
        ],
        [
          "data/outcome/a.bin",
          sha(CSV),
          CSV.length,
          sha(readFileSync(at("data/outcome/a.bin.age"))),
        ],
      ]);
      expect(blindFindings()).toEqual([]);
    });

    it("what was sealed decrypts with the private key to the very bytes the manifest hashed", () => {
      // Guards: the seal is real age to the plan's recipient — the key holder gets the plaintext back.
      const a = sh("age", ["-d", "-i", key, at("RESULTS.md.age")]);
      const b = sh("age", ["-d", "-i", key, at("data/outcome/a.bin.age")]);
      expect([a.status, a.out, b.status, sha(b.stdout)]).toEqual([
        0,
        RESULTS,
        0,
        sha(CSV),
      ]);
    });
  },
);

describe.skipIf(SKIP)(
  "a blind study sealed with the real age — re-runs",
  () => {
    it("a second seal changes nothing; verify passes without a key", () => {
      const before = readFileSync(at("sealed.json"), "utf8");
      const again = paperlint(["studies", "seal", "papers/example", "P1-S01"]);
      const v = paperlint(["studies", "verify", "papers/example", "P1-S01"]);
      // Guards: idempotent, byte for byte; verify needs no identity.
      expect([
        again.status,
        readFileSync(at("sealed.json"), "utf8") === before,
      ]).toEqual([0, true]);
      expect([v.status, v.out.trim()]).toEqual([
        0,
        "P1-S01: 2 files sealed, every ciphertext the one recorded. Still sealed: the plaintexts are checked once it is unsealed.",
      ]);
    });

    it("a changed result is refused and nothing written", () => {
      writeFileSync(at("RESULTS.md"), "59 of 60 pass\n");
      const before = readFileSync(at("sealed.json"), "utf8");
      const r = paperlint(["studies", "seal", "papers/example", "P1-S01"]);
      // Guards: no swap through a re-seal — the plaintext stays to be looked at, the manifest unchanged.
      expect([
        r.status,
        r.err.split("\n")[0],
        readFileSync(at("sealed.json"), "utf8") === before,
      ]).toEqual([
        1,
        "P1-S01: 1 result file not the one sealed, and a sealed result is never replaced by a seal. Nothing was written.",
        true,
      ]);
      rmSync(at("RESULTS.md"));
    });
  },
);

describe.skipIf(SKIP)(
  "a blind study sealed with the real age — tampering",
  () => {
    it("verify names a ciphertext swapped for another valid one", () => {
      const original = readFileSync(at("RESULTS.md.age"));
      const recipient = sh("age-keygen", ["-y", key]).out.trim();
      const forged = sh("age", ["-r", recipient], {
        input: new TextEncoder().encode("60 of 60 pass\n"),
      });
      writeFileSync(at("RESULTS.md.age"), forged.stdout);
      const v = paperlint(["studies", "verify", "papers/example", "P1-S01"]);
      // Guards: anyone can encrypt to a public key; the recorded hash catches the swap with no key.
      expect([v.status, v.err.trim().split("\n").slice(1)]).toEqual([
        1,
        [
          `  RESULTS.md.age: sha256 ${sha(forged.stdout)}, the manifest recorded ${sha(original)} — the ciphertext is not the one sealed`,
        ],
      ]);
      writeFileSync(at("RESULTS.md.age"), original);
    });

    it("without age on PATH, seal stops with the install hint and writes nothing", () => {
      writeFileSync(at("data/outcome/b.bin"), "x");
      const r = paperlint(["studies", "seal", "papers/example", "P1-S01"], {
        PATH: dirname(process.execPath),
      });
      // Guards: a missing age is named with how to install it, and the plaintext is not removed.
      expect([
        r.status,
        r.err.trim(),
        existsSync(at("data/outcome/b.bin")),
      ]).toEqual([
        1,
        "age is not installed, and this command runs it (this package implements no cryptography). Install it — `apt install age`, `brew install age`, or a release from https://github.com/FiloSottile/age/releases — then run this again.",
        true,
      ]);
      rmSync(at("data/outcome/b.bin"));
    });
  },
);

describe.skipIf(SKIP)(
  "a blind study sealed with the real age — unsealing, gated on git",
  () => {
    const T1 = "2026-10-16T10:00:00+05:00";
    const T2 = "2026-10-16T11:00:00+05:00";
    const unseal = () =>
      paperlint([
        "studies",
        "unseal",
        "papers/example",
        "P1-S01",
        "--identity",
        key,
      ]);

    it("refuses while the decision is uncommitted, and writes nothing", () => {
      initRepo(dir);
      commit(dir, {}, T1, "the sealed results");
      const r = unseal();
      // Guards: the key is not used before the decision is in history.
      expect([r.status, r.err.trim(), existsSync(at("RESULTS.md"))]).toEqual([
        1,
        "P1-S01: the decision repro/P1-S01-outcome/exclusions.md is not committed; unsealing waits for it. Write the decision there, commit it, then run this again.",
        false,
      ]);
    });

    it("unseals once the decision is committed: the bytes sealed, the gate recorded, verify and lint clean", () => {
      const sha1 = commit(
        dir,
        { "papers/example/repro/P1-S01-outcome/exclusions.md": "none\n" },
        T2,
        "the decision",
      );
      const r = unseal();
      const v = paperlint(["studies", "verify", "papers/example", "P1-S01"]);
      const manifest = UnsealedManifest.parse(
        JSON.parse(readFileSync(at("sealed.json"), "utf8")),
      );
      // Guards: the plaintexts are the very bytes sealed, the gate's commit is recorded, and anyone can check it.
      expect([
        r.status,
        readFileSync(at("RESULTS.md"), "utf8"),
        sha(readFileSync(at("data/outcome/a.bin"))),
        manifest.unsealed.gate,
        v.status,
        blindFindings(),
      ]).toEqual([
        0,
        RESULTS,
        sha(CSV),
        { file: "repro/P1-S01-outcome/exclusions.md", commit: sha1, date: T2 },
        0,
        [],
      ]);
    });
  },
);
