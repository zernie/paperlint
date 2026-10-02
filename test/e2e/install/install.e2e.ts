/**
 * INSTALL E2E: pack the package and install it into a CLEAN consumer with every available
 * manager, then check what the consumer actually does.
 *
 * 🔴 WHY A SEPARATE RUN AND NOT A CELL IN `npm test`. Everything the harnesses check lives
 * INSIDE the repository, where `node_modules`, the sources and the config all sit side by side.
 * The consumer gets a different tree: a tarball unpacked by a manager BY ITS OWN RULES. One
 * decision has already diverged between those two worlds — moving `vigiles` from peer to regular
 * dependencies works on npm and does NOT work on pnpm, because the hook wiring addresses the
 * runtime from the project root, and pnpm does not put transitive dependencies at the root. That
 * was not found by a test.
 *
 * 🔴 THE MAIN CHECK IS THAT THE HOOK COMMAND RUNS, NOT THAT IT MATCHES A STRING. Grepping the
 * path in `hooks.json` is useless: the string there is correct under any manager, while whether
 * it resolves is a property of the tree laid out on disk. So the command is launched, and the
 * verdict is based on whether it died on `Cannot find module`.
 *
 * One test per package manager, each the whole scenario: its steps depend on each other (no
 * consumer without the install, no hook to run without the consumer), so they are one test, and
 * every mismatch inside it is a soft expectation — the run reports all of them, not the first.
 * A manager that does not launch is a skip here and a failure under CI (`../need.ts`).
 *
 *   npm run test:e2e:install        PAPERLINT_E2E_KEEP=1 keeps the consumers for a look
 */
import { printed } from "../../../src/domain/text.ts";
import {
  execFileSync,
  spawnSync,
  type SpawnSyncOptions,
  type SpawnSyncReturns,
} from "node:child_process";
import {
  installedSkills,
  PACKAGE_NAME,
  SHIPPED_SKILLS_DIR,
} from "../../../skills/paper-pipeline/scripts/consumer.mjs";
import {
  mkdtempSync,
  mkdirSync,
  cpSync,
  writeFileSync,
  rmSync,
  existsSync,
  readFileSync,
  readlinkSync,
  readdirSync,
  realpathSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { z } from "zod";
import {
  compareToBaseline,
  countByRule,
  type Counts,
} from "../../../fixtures/real-markdown-paper/baseline.ts";
import { renderDetail } from "../../../lib/check.ts";
import { afterAll, beforeAll, describe, it } from "vitest";
import { check, missing } from "../need.ts";
import { documentedSpecifiers, modulePaths } from "../public-paths.ts";

const ROOT = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));
const KEEP = process.env.PAPERLINT_E2E_KEEP === "1";

const sh = (
  cmd: string,
  args: readonly string[],
  opts: Omit<SpawnSyncOptions, "encoding"> = {},
): SpawnSyncReturns<string> => {
  const r = spawnSync(cmd, args, { encoding: "utf8", ...opts });
  // Both streams are undefined when the spawn itself failed, whatever Node's types say.
  return { ...r, stdout: printed(r.stdout), stderr: printed(r.stderr) };
};

/** An error's code and message, as the checks print them. */
function describeError(e: unknown): string {
  const code =
    e instanceof Error && "code" in e && typeof e.code === "string"
      ? e.code
      : undefined;
  return `${code ?? "error"}: ${e instanceof Error ? e.message : String(e)}`;
}

/** An error's message alone. */
const messageOf = (e: unknown): string =>
  e instanceof Error ? e.message : String(e);

/** The manifest's one field this run reads: `bin`, a path or a map of names to paths. */
const Manifest = z.looseObject({
  bin: z.union([z.string(), z.record(z.string(), z.string())]).optional(),
});
type Manifest = z.infer<typeof Manifest>;

/**
 * Hook wiring, as `plugin/hooks/hooks.json` and `.claude/settings.json` both spell it:
 * `{ hooks: { <event>: [{ hooks: [{ command }] }] } }`.
 */
const HookWiring = z.looseObject({
  hooks: z
    .record(
      z.string(),
      z
        .array(
          z.looseObject({
            hooks: z
              .array(z.looseObject({ command: z.string().optional() }))
              .nullish(),
          }),
        )
        .nullish(),
    )
    .nullish(),
});

/** `paperlint lint --json`: ESLint's results, with the fields the checks read. */
const LintReport = z.array(
  z.looseObject({
    filePath: z.string(),
    messages: z.array(
      z.looseObject({
        ruleId: z.string().nullable(),
        severity: z.number(),
        message: z.string(),
      }),
    ),
  }),
);

/** ESLint's results, each file's other fields kept, so the article's findings can be re-counted. */
const LintFiles = z.array(z.looseObject({ filePath: z.string() }));

/** A package manager this run measures: how to probe it, how to install with it, and why it is here. */
interface Manager {
  name: string;
  probe: [string, string[]];
  install: (tgz: string) => [string, string[]];
  why: string;
}

/**
 * The managers this run is SUPPOSED to measure, declared as data with the reason each is here.
 * A list, because "which managers did this run actually cover" has to be answerable from the
 * output — not inferred from how many `──` headers scrolled past.
 */
const WANTED: readonly Manager[] = [
  {
    name: "npm",
    probe: ["npm", ["--version"]],
    install: (tgz) => ["npm", ["install", "--silent", tgz]],
    why: "the default; `.bin` holds a symlink to the .mjs",
  },
  {
    name: "pnpm",
    probe: ["pnpm", ["--version"]],
    // The BARE command a reader of the README types, with no flags. Until vigiles 31.0.0 this
    // needed three `--allow-build` flags: vigiles pulled @ast-grep/lang-{python,ruby,rust}, each
    // with a postinstall, and pnpm 10+ exits 1 (ERR_PNPM_IGNORED_BUILDS) on an unapproved
    // dependency script. vigiles 31 parses those languages with bundled WASM grammars and has no
    // install scripts (zernie/vigiles#280), so the flags and the pin that watched for this day
    // are gone. A dependency that brings a postinstall back turns this install red.
    install: (tgz) => ["pnpm", ["install", "--silent", tgz]],
    why:
      "does NOT put transitive dependencies at the project root, and `.bin` holds a shell " +
      "wrapper rather than a symlink — both have already broken this package",
  },
];

/**
 * The corpus `lint` must pass clean. TWO papers, and they are different ON PURPOSE.
 *
 * ⚠️ The comment here used to call this "a small but REAL corpus". It was not: the source was the
 * four bytes `abcd` and the PDF was a hundred `x`. That is enough to drive the STAGE machinery —
 * a declared stage, its pdf, its byte counts, the cross-check between them — and it is the reason
 * those stubs stay. But calling it real overstated what the run proves, and a label that
 * overstates is how a test stops being read.
 *
 * So the stub paper keeps the stage rules honest, and `fixtures/build-e2e/acmart` — an actual
 * `\documentclass{acmart}` source, the same one the build e2e compiles with a real `pdflatex` —
 * makes sure the LaTeX rules see LaTeX rather than a placeholder. Neither covers the other:
 * measured 2026-09-19, the acmart fixture alone linted 2 files, the stub alone drives the stages.
 */
function stageCorpus(root: string): void {
  const paper = join(root, "papers", "p1");
  mkdirSync(join(paper, "versions"), { recursive: true });
  writeFileSync(join(paper, "versions", "s.tex"), "abcd");
  writeFileSync(
    join(paper, "versions", "2026-07-22-submitted.pdf"),
    "x".repeat(100),
  );
  writeFileSync(join(paper, "paper.md"), "# Intro\n\nRQ1: does it hold?\n");
  writeFileSync(
    join(paper, "PIPELINE-STATUS.md"),
    `---\nstages:\n  - stage: submitted\n    date: 2026-07-22\n    pdf: versions/2026-07-22-submitted.pdf\n    bytes: 100\n    source: versions/s.tex\n    sourceBytes: 4\n---\n# S\n\n| id | note |\n|---|---|\n| cites | bib-authors run |\n`,
  );
  // The real LaTeX half. Copied from this repository's own fixture rather than written inline:
  // a second inline copy of an acmart preamble would drift from the one the build e2e compiles,
  // and then the two tests would disagree about what a paper looks like.
  cpSync(
    join(ROOT, "fixtures", "build-e2e", "acmart"),
    join(root, "papers", "acmart"),
    { recursive: true },
  );
}

/**
 * WHERE THE PACKAGE LANDED, asked of Node rather than spelled out (docs/prior-art/package-location.md).
 *
 * The spelling `node_modules/<package>` is not wrong under npm or pnpm. What
 * resolution adds is a second claim the hardcode cannot see: the package is REACHABLE BY NAME
 * from the consumer. Measured there with a closed `exports` map — the directory still exists, every
 * `existsSync` stays green, and the documented public import is broken. `createRequire`, not
 * `findPackageJSON`: the latter answers past a broken map, which makes it the better locator and
 * the worse canary.
 */
function locateInstalled(
  consumer: string,
): { dir: string; manifest: Manifest; err?: undefined } | { err: string } {
  const req = createRequire(
    pathToFileURL(join(consumer, "__consumer__.js")).href,
  );
  try {
    const file = req.resolve(`${PACKAGE_NAME}/package.json`);
    return {
      dir: dirname(file),
      manifest: Manifest.parse(JSON.parse(readFileSync(file, "utf8"))),
    };
  } catch (e) {
    return { err: describeError(e) };
  }
}

/**
 * The skills directory under `root`, from the same constant the linker reads. A root without it is
 * an error, not zero skills: an empty list would read as a clean install.
 */
function skillsDir(root: string): string {
  const dir = join(root, SHIPPED_SKILLS_DIR);
  if (!existsSync(dir)) throw new Error(`no skills directory at ${dir}`);
  return dir;
}

/**
 * The hook commands are taken FROM THE PUBLISHED `hooks.json`, not from the copy in the
 * repository: we check what arrived, not what we shipped.
 */
/** Every non-empty hook command in a wiring file, in the order it lists them. */
const commandsIn = (json: z.infer<typeof HookWiring>): string[] =>
  Object.values(json.hooks ?? {}).flatMap((entries) =>
    (entries ?? []).flatMap((entry) =>
      (entry.hooks ?? []).flatMap((h) => (h.command ? [h.command] : [])),
    ),
  );

/**
 * Run each hook command from the consumer, as its settings would, and return the ones that did not
 * resolve: their position in `cmds` and what they printed.
 *
 * The exit code is not judged: a guard may legitimately return 2 on the merits. What is judged is
 * the RESOLVE.
 *
 * 🔴 `is NOT running` IN THE LIST IS LOAD-BEARING. The first edition looked only for
 * `Cannot find module`, while `paperlint hook` with an unresolvable runtime catches the exception
 * and complains in DIFFERENT words, returning 0 — and the test printed "all 3 commands resolve"
 * with the hooks completely broken. A false green of exactly the class this test is written for:
 * the check looked for the spelling it REMEMBERED, not for the thing itself.
 */
function unresolvedHooks(
  cmds: readonly string[],
  consumer: string,
): { index: number; out: string }[] {
  return cmds.flatMap((command) => {
    const r = sh("bash", ["-c", command], {
      cwd: consumer,
      input: "{}",
      env: { ...process.env, CLAUDE_PROJECT_DIR: consumer },
    });
    const out = r.stderr + r.stdout;
    return /Cannot find module|MODULE_NOT_FOUND|No such file or directory|is NOT running/.test(
      out,
    )
      ? [{ index: cmds.indexOf(command), out }]
      : [];
  });
}

/** One verdict per hook command that did not resolve, or one saying they all did. */
function reportHooks(
  cmds: readonly string[],
  failures: readonly { index: number; out: string }[],
  {
    ok,
    bad,
  }: {
    ok: (label: string) => void;
    bad: (label: string, detail?: unknown) => void;
  },
): void {
  for (const f of failures)
    bad(
      `the hook command resolves (${String(f.index + 1)}/${String(cmds.length)})`,
      f.out,
    );
  if (failures.length === 0)
    ok(`all ${String(cmds.length)} hook command(s) resolve`);
}

function hookCommands(
  installed: string,
): { cmds: string[]; err?: undefined } | { err: string; cmds?: undefined } {
  const file = join(installed, "plugin", "hooks", "hooks.json");
  if (!existsSync(file))
    return {
      err: `plugin/hooks/hooks.json did not arrive in the tarball: ${file}`,
    };
  let json: z.infer<typeof HookWiring>;
  try {
    json = HookWiring.parse(JSON.parse(readFileSync(file, "utf8")));
  } catch (e) {
    return { err: `hooks.json does not parse: ${messageOf(e)}` };
  }
  const cmds = commandsIn(json);
  if (cmds.length === 0)
    return { err: "zero commands in hooks.json — there is nothing to check" };
  return { cmds };
}

/**
 * 🔴 WHAT ARRIVED, COUNTED AGAINST WHAT EXISTS — not against a number written here.
 *
 * The README claims the install brings the skills. Until now nothing checked it: the only
 * delivery assertion was that `plugin/hooks/hooks.json` reached the tarball, so a package that
 * shipped ZERO skills would have passed a test written for exactly that defect. A hardcoded
 * count would be no better — it would go stale the first time a skill is added, and the staleness
 * would read as a pass.
 *
 * The second half is the one that catches the real class: a skill that names a script by a path
 * which only resolves from one working directory. That path is correct in the repository and
 * absent in the consumer, which is why reading the prose never finds it.
 */
function contentDelivery(installed: string): {
  here: number;
  there: number;
  missing: string[];
  refs: number;
  unresolved: string[];
} {
  const listSkills = (root: string): string[] => {
    const dir = skillsDir(root);
    if (!existsSync(dir)) return [];
    return installedSkills(dir);
  };
  const here = listSkills(ROOT);
  const there = listSkills(installed);
  const missing = here.filter((n) => !there.includes(n));

  // Resolve every script a delivered SKILL.md names, from the consumer's tree.
  const unresolved: string[] = [];
  let refs = 0;
  for (const name of there) {
    const skills = skillsDir(installed);
    const body = readFileSync(join(skills, name, "SKILL.md"), "utf8");
    for (const m of body.matchAll(/([\w./-]*scripts\/[\w-]+\.mjs)/g)) {
      refs++;
      const raw = m[1] ?? "";
      // TWO bases, and both are the declared skills directory. A third — the package root — was
      // measured dead (0 of 104 references, docs/prior-art/package-location.md § 9) and is gone:
      // a candidate nothing uses can only ever hide a wrong-base reference, never find one.
      const candidates = [
        // skill-relative: `scripts/x.mjs`, `../other/scripts/x.mjs`
        join(skills, name, raw),
        // the install-path spelling the port rule exists to retire (paperlint#19); counted as resolvable
        // only if the file is genuinely there under the declared skills directory
        join(skills, raw.replace(/^\.claude\/skills\//, "")),
      ];
      if (!candidates.some(existsSync)) unresolved.push(`${name}: ${raw}`);
    }
  }
  return { here: here.length, there: there.length, missing, refs, unresolved };
}

/**
 * 🔴 THE CONSUMER'S VIEW OF THE SKILLS — what Claude Code actually reads. `contentDelivery` above
 * proves the skills reached `node_modules`; that is necessary and NOT sufficient, because Claude
 * Code discovers project skills only in `<project>/.claude/skills/<name>/SKILL.md` and never looks
 * inside `node_modules`. The README claimed otherwise until Codex caught it on #45, and a consumer
 * who followed it had no `/paper-pipeline` — while every check here stayed green, because every
 * check looked at the package directory.
 *
 * So this walks the SAME list — every skill the installed package declares — from the consumer
 * root, through the links `paperlint init` made, and resolves the script paths the skills name the way
 * the agent will: `.claude/skills/<skill>/scripts/x.mjs` from the project root, `scripts/x.mjs`
 * from the skill's own directory as the project sees it.
 */
function consumerSkillView(
  consumer: string,
  installed: string,
): {
  names: string[];
  unreachable: string[];
  notLinks: string[];
  links: Record<string, string>;
  refs: number;
  rootRefs: number;
  unresolved: string[];
} {
  const names = installedSkills(skillsDir(installed));
  const seen = names.map((name) => skillSeen(consumer, name));
  const reached = seen.flatMap((s) => (s.kind === "reached" ? [s] : []));
  const scripts = reached.flatMap((s) =>
    s.scripts.map((r) => ({ skill: s.name, ...r })),
  );
  return {
    names,
    unreachable: seen.flatMap((s) =>
      s.kind === "unreachable" ? [s.name] : [],
    ),
    notLinks: reached.flatMap((s) => (s.link === null ? [s.name] : [])),
    links: Object.fromEntries(
      reached.flatMap((s) => (s.link === null ? [] : [[s.name, s.link]])),
    ),
    refs: scripts.length,
    rootRefs: scripts.filter((r) => r.fromRoot).length,
    unresolved: scripts.flatMap((r) =>
      r.resolves ? [] : [`${r.skill}: ${r.raw}`],
    ),
  };
}

/** A script path a SKILL.md names, and whether it resolves the way the agent resolves it. */
interface ScriptRef {
  readonly raw: string;
  readonly fromRoot: boolean;
  readonly resolves: boolean;
}

/** One skill as the consumer's project sees it: absent, or there — as a link or as a copy. */
type SkillSeen =
  | { readonly kind: "unreachable"; readonly name: string }
  | {
      readonly kind: "reached";
      readonly name: string;
      /** Where the entry links to, or null when it is not a symlink. */
      readonly link: string | null;
      readonly scripts: readonly ScriptRef[];
    };

/** The skill `name` from the consumer root, `.claude/skills/<name>/SKILL.md`. */
function skillSeen(consumer: string, name: string): SkillSeen {
  const entry = join(consumer, ".claude", "skills", name);
  if (!existsSync(join(entry, "SKILL.md")))
    return { kind: "unreachable", name };
  return {
    kind: "reached",
    name,
    link: linkTarget(entry),
    scripts: scriptRefs(consumer, entry),
  };
}

/** What `entry` links to, or null when it is not a symlink. */
function linkTarget(entry: string): string | null {
  try {
    return readlinkSync(entry);
  } catch {
    return null;
  }
}

/**
 * The script paths a skill's SKILL.md names: `.claude/skills/<skill>/scripts/x.mjs` resolved from
 * the project root, anything else from the skill's own directory.
 */
function scriptRefs(consumer: string, entry: string): readonly ScriptRef[] {
  const body = readFileSync(join(entry, "SKILL.md"), "utf8");
  return [...body.matchAll(/([\w./-]*scripts\/[\w-]+\.mjs)/g)].map((m) => {
    const raw = m[1] ?? "";
    const fromRoot = raw.startsWith(".claude/skills/");
    const at = fromRoot ? join(consumer, raw) : join(entry, raw);
    return { raw, fromRoot, resolves: existsSync(at) };
  });
}

// realpathSync is NOT decoration: on macOS `/var` is a symlink to `/private/var`, and a path
// recorded before resolution does not match what a process returns from inside. This is a
// separate class, and it has already cost a red npm test on macOS only (vigiles#241).
const work = realpathSync(mkdtempSync(join(tmpdir(), "paperlint-e2e-")));
let tgz = "";

beforeAll(() => {
  const packed = execFileSync(
    "npm",
    ["pack", "--silent", "--pack-destination", work],
    {
      cwd: ROOT,
      encoding: "utf8",
    },
  )
    .trim()
    .split("\n")
    .pop();
  // `split` always returns at least one element, so this names a case that cannot occur.
  if (packed === undefined) throw new Error("npm pack printed nothing");
  tgz = join(work, packed);
  if (!existsSync(tgz)) throw new Error(`npm pack left no tarball: ${tgz}`);
  console.log(`tarball: ${packed}\n`);
});

afterAll(() => {
  if (KEEP) console.log(`(PAPERLINT_E2E_KEEP) the tree was kept: ${work}`);
  else rmSync(work, { recursive: true, force: true });
});

/** A manager with the version it printed, or null when it does not launch here. */
const probed = WANTED.map((m) => {
  const r = sh(m.probe[0], m.probe[1]);
  return { ...m, version: r.status === 0 ? r.stdout.trim() : null };
});

describe.each(probed)("installed with $name", (m) => {
  // In CI a manager that is not installed is a broken environment, and the npm/pnpm difference
  // is this file's whole point: measuring one of them is not measuring the package.
  const skip = missing(m.name, m.version !== null, m.why);
  it.skipIf(skip)(
    `${m.name}: the consumer installs it and every check below holds`,
    () => {
      scenario({ ...m, version: m.version ?? "" });
    },
  );
});

/** The skills as the consumer sees them, from `consumerSkillView`. */
type SkillView = ReturnType<typeof consumerSkillView>;

/** `.claude/settings.json` in the consumer, and its bytes after the first `init`. */
interface Settings {
  readonly path: string;
  readonly before: Buffer | null;
}

/** What every step of one manager's scenario works on. */
interface Consumer {
  readonly m: Manager & { version: string };
  /** The consumer project the package was installed into. */
  readonly consumer: string;
  /** Where the installed package lives. */
  readonly installed: string;
  readonly manifest: Manifest;
  /** The binary the manager put in `.bin` — launched directly, see `stepBin`. */
  readonly bin: string;
}

const ok = (label: string): void => {
  console.log(`  ✓ ${label}`);
};
const bad = (label: string, detail?: unknown): void => {
  const shown = renderDetail(detail).trim();
  check(label, false, shown);
  console.log(
    `  ✗ ${label}${shown ? `\n      ${shown.split("\n").slice(0, 3).join("\n      ")}` : ""}`,
  );
};
/** One check: `ok` under `passLabel` (the label, unless the pass names more), else `bad`. */
const verdict = (
  pass: boolean,
  label: string,
  detail?: unknown,
  passLabel = label,
): void => {
  if (pass) ok(passLabel);
  else bad(label, detail);
};

/** The whole scenario for one manager; every check in it is soft (`check` in `../need.ts`). */
function scenario(m: Manager & { version: string }): void {
  const consumer = join(work, `consumer-${m.name}`);
  mkdirSync(consumer, { recursive: true });
  writeFileSync(
    join(consumer, "package.json"),
    '{"name":"c","version":"1.0.0","private":true}',
  );
  console.log(`── ${m.name} ${m.version}`);
  const [cmd, args] = m.install(tgz);
  const inst = sh(cmd, args, { cwd: consumer });
  if (inst.status === 0) ok("the install went through");
  else bad("the install went through", inst.stderr || inst.stdout);

  const located = locateInstalled(consumer);
  if (located.err !== undefined) {
    bad("the package resolves BY NAME from the consumer", located.err);
    // Nothing below can be measured against a package Node cannot find; say so and move on
    // rather than guess a path and report on the guess.
    return;
  }
  ok("the package resolves BY NAME from the consumer");
  const installed = located.dir;

  const c: Consumer = {
    m,
    consumer,
    installed,
    manifest: located.manifest,
    bin: join(consumer, "node_modules", ".bin", PACKAGE_NAME),
  };
  stepBin(c);
  const initSaid = stepInit(c);
  const view = stepSkills(c, initSaid);
  stepSkillPaths(view);
  const settings = stepWiring(c, initSaid);
  stepImports(c);
  stepRerun(c, view, settings);
  stepLintClean(c);
  stepRealArticle(c);
  stepHooksAndContent(c);
  stepTaken(c, view);
  stepAidc(c);
}

function stepBin(c: Consumer): void {
  const { consumer, installed, manifest, bin } = c;
  // 🔴 THE BIN IS LAUNCHED DIRECTLY, NOT THROUGH `node <path>`. Under npm `.bin` holds a
  // SYMLINK to the `.mjs`, and `node` swallows it; under pnpm it holds a SHELL WRAPPER, and
  // `node` chokes on its very first line `basedir=$(dirname …)`. The first edition of this test
  // called `node bin` and reported three false failures on pnpm — that is, it measured my way
  // of launching, not the package. The consumer calls `npx paperlint`, which executes the file rather
  // than feeding it to node.
  const help = sh(bin, ["--help"], { cwd: consumer });
  if (help.status === 0) {
    ok(`\`${PACKAGE_NAME} --help\` answers with zero`);
  } else {
    bad(`\`${PACKAGE_NAME} --help\` answers with zero`, help.stderr);
  }
  // The shim above proves the MANAGER did its part. This proves the file the manifest PROMISES
  // exists and runs — the real file under both managers, so `node <it>` is uniform where
  // `node <shim>` is not (pnpm writes a shell wrapper).
  const binField = manifest.bin;
  const binRel =
    typeof binField === "string" ? binField : binField?.[PACKAGE_NAME];
  if (!binRel)
    bad(
      `the manifest declares the \`${PACKAGE_NAME}\` bin`,
      JSON.stringify(binField),
    );
  else {
    const real = sh(process.execPath, [join(installed, binRel), "--help"], {
      cwd: consumer,
    });
    verdict(
      real.status === 0,
      `the manifest's bin (${binRel}) runs under node`,
      real.stderr,
    );
  }
}

function stepInit(c: Consumer): string {
  const { consumer, bin } = c;
  // 🔴 THE CORPUS IS STAGED BEFORE `init`, AND THIS IS NOT A REORDERING FOR CONVENIENCE. `init`
  // now MEASURES the papers directory instead of guessing it; a run over an empty tree would
  // measure the default branch and stay silent about the one the command was rewritten for.
  stageCorpus(consumer);
  const init = sh(bin, ["init"], { cwd: consumer });
  // The corpus is staged under `papers/`, the default: init measures it and, finding the
  // default, writes NO paperlint.json. A file here would mean it wrote what it did not need.
  if (existsSync(join(consumer, "paperlint.json"))) {
    bad(
      "`paperlint init` took the default papers directory and wrote no paperlint.json",
      `${readFileSync(join(consumer, "paperlint.json"), "utf8")}\n${init.stdout}${init.stderr}`,
    );
  } else {
    ok(
      "`paperlint init` took the default papers directory and wrote no paperlint.json",
    );
  }
  if (init.status === 0) {
    ok("`paperlint init` finished with zero — doctor found no discrepancy");
  } else {
    bad(
      "`paperlint init` finished with zero — doctor found no discrepancy",
      init.stdout + init.stderr,
    );
  }
  return init.stdout;
}

function stepSkills(c: Consumer, initSaid: string): SkillView {
  const { consumer, installed } = c;
  // The skills, as Claude Code will look for them: in the consumer, not in node_modules.
  const view = consumerSkillView(consumer, installed);
  if (view.names.length > 0 && view.unreachable.length === 0) {
    ok(
      `all ${String(view.names.length)} shipped skill(s) are reachable as .claude/skills/<name>/SKILL.md`,
    );
  } else {
    bad(
      `all ${String(view.names.length)} shipped skill(s) are reachable as .claude/skills/<name>/SKILL.md`,
      `not reachable: ${view.unreachable.join(", ") || "(the package declares zero skills)"}\n${initSaid}`,
    );
  }
  if (
    view.notLinks.length === 0 &&
    Object.values(view.links).every((t) => !t.startsWith("/"))
  ) {
    ok("each is a RELATIVE symlink, not a copy");
  } else {
    bad(
      "each is a RELATIVE symlink, not a copy",
      `not links: ${view.notLinks.join(", ") || "-"}; absolute: ${
        Object.entries(view.links)
          .filter(([, t]) => t.startsWith("/"))
          .map(([n]) => n)
          .join(", ") || "-"
      }`,
    );
  }
  return view;
}

/** Every script path the linked skills name resolves from the consumer's root. */
function stepSkillPaths(view: SkillView): void {
  if (view.rootRefs > 0 && view.unresolved.length === 0) {
    ok(
      `all ${String(view.refs)} script path(s) resolve FROM THE CONSUMER ROOT (${String(view.rootRefs)} project-root-relative)`,
    );
  } else {
    bad(
      `all ${String(view.refs)} script path(s) resolve FROM THE CONSUMER ROOT (${String(view.rootRefs)} project-root-relative)`,
      view.unresolved.slice(0, 5).join("\n") ||
        "zero project-root-relative references — nothing was checked",
    );
  }
}

function stepWiring(c: Consumer, initSaid: string): Settings {
  const { consumer, installed } = c;
  // 🔴 THE HOOKS ARE WIRED WHERE CLAUDE CODE READS THEM, BY init ITSELF. No `/plugin` line is
  // typed anywhere: `init` without a terminal takes the YES default and writes the three
  // commands into `.claude/settings.json` — the same commands `plugin/hooks/hooks.json`
  // publishes, once each. Whether they RESOLVE is judged below, by running them.
  const settingsPath = join(consumer, ".claude", "settings.json");
  const wiredCommands = ((): (string | undefined)[] | { err: string } => {
    try {
      const json = HookWiring.parse(
        JSON.parse(readFileSync(settingsPath, "utf8")),
      );
      return Object.values(json.hooks ?? {}).flatMap((entries) =>
        (entries ?? []).flatMap((e) => (e.hooks ?? []).map((h) => h.command)),
      );
    } catch (e) {
      return { err: messageOf(e) };
    }
  })();
  const published = hookCommands(installed);
  if (
    Array.isArray(wiredCommands) &&
    published.err === undefined &&
    wiredCommands.length === published.cmds.length &&
    published.cmds.every(
      (c) => wiredCommands.filter((w) => w === c).length === 1,
    )
  ) {
    ok(
      `\`paperlint init\` wired all ${String(wiredCommands.length)} hook command(s) into .claude/settings.json, once each`,
    );
  } else {
    bad(
      "`paperlint init` wired the hooks into .claude/settings.json, once each",
      `${JSON.stringify(wiredCommands).slice(0, 300)}\n${initSaid}`,
    );
  }
  if (/in a fresh clone they cannot run until `npm install`/.test(initSaid)) {
    ok("and it says the hook commands need `npm install` in a fresh clone");
  } else {
    bad(
      "and it says the hook commands need `npm install` in a fresh clone",
      initSaid,
    );
  }
  const settingsBefore = existsSync(settingsPath)
    ? readFileSync(settingsPath)
    : null;
  return { path: settingsPath, before: settingsBefore };
}

function stepImports(c: Consumer): void {
  const { consumer, installed } = c;
  // Every module path a consumer may import resolves and loads from the INSTALLED package: the
  // `paperlint/…` imports in the shipped docs' code blocks, and `paperlint/lib/<name>.mjs` /
  // `paperlint/eslint-rules/<name>.mjs` for every module shipped. Moving the sources to
  // TypeScript put the code in `dist/`; the public names must not move with it. One process
  // imports them all, from the consumer's directory, the way a consumer's config would — AFTER
  // `init`, because `lib/skill-corpus.mjs` reads the consumer's `.claude/skills/` when it loads.
  const docsDir = join(installed, "docs");
  const specifiers = [
    ...new Set([
      ...readdirSync(docsDir)
        .filter((f) => f.endsWith(".md"))
        .flatMap((f) =>
          documentedSpecifiers(readFileSync(join(docsDir, f), "utf8")),
        ),
      ...modulePaths(installed),
    ]),
  ];
  const loaded = sh(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `const failed = [];
for (const s of ${JSON.stringify(specifiers)}) {
try { await import(s); } catch (e) { failed.push(s + " — " + (e.code ?? e.message)); }
}
console.log(JSON.stringify(failed));`,
    ],
    { cwd: consumer },
  );
  const failedImports = z
    .array(z.string())
    .safeParse(loaded.status === 0 ? JSON.parse(loaded.stdout) : null);
  verdict(
    failedImports.success && failedImports.data.length === 0,
    `every public module path loads from the installed package (${String(specifiers.length)})`,
    failedImports.success ? failedImports.data.join("\n") : loaded.stderr,
  );
}

function stepRerun(c: Consumer, view: SkillView, settings: Settings): void {
  const { consumer, installed, bin } = c;
  // A second `init` is a re-run, not a clash: nothing fails, no link moves.
  const again = sh(bin, ["init"], { cwd: consumer });
  if (
    settings.before !== null &&
    readFileSync(settings.path).equals(settings.before)
  ) {
    ok("a second `paperlint init` leaves .claude/settings.json byte-identical");
  } else {
    bad(
      "a second `paperlint init` leaves .claude/settings.json byte-identical",
      again.stdout,
    );
  }
  const after = consumerSkillView(consumer, installed);
  if (
    again.status === 0 &&
    view.names.every((n) => after.links[n] === view.links[n]) &&
    new RegExp(
      `0 linked now, ${String(view.names.length)} already linked, 0 skipped`,
    ).test(again.stdout)
  ) {
    ok("a second `paperlint init` exits zero and leaves every link as it was");
  } else {
    bad(
      "a second `paperlint init` exits zero and leaves every link as it was",
      `exit ${String(again.status)}\n${again.stdout
        .split("\n")
        .filter((l) => /shipped|skills/.test(l))
        .join("\n")}${again.stderr}`,
    );
  }
}

// 🔴 "CLEAN" MEANS: EXIT 0, AND ONLY THE WARNINGS A CORRECT CORPUS MUST CARRY, one per paper:
// the acmart paper extends agenticdev and is not built here, so `pdf/measured` says the venue
// checks did not run; a paper made by `paperlint new` names no venue yet, and `pdf/measured`
// says that. Their absence would be a green zero; any other finding is a false positive.
const expectedWarnings =
  (papers: Record<string, RegExp>) =>
  (r: SpawnSyncReturns<string>): boolean => {
    try {
      const ms = LintReport.parse(JSON.parse(r.stdout)).flatMap((f) =>
        f.messages.map((m) => ({ ...m, file: f.filePath })),
      );
      const want = Object.entries(papers);
      return (
        r.status === 0 &&
        ms.length === want.length &&
        want.every(([paper, text]) =>
          ms.some(
            (m) =>
              m.ruleId === "pdf/measured" &&
              m.severity === 1 &&
              m.file.endsWith(join(paper, "paper.tex")) &&
              text.test(m.message),
          ),
        )
      );
    } catch {
      return false;
    }
  };
const UNBUILT = /not built yet, so .*page limit/;
const NO_PRESET = /names no venue preset yet/;

function stepLintClean(c: Consumer): void {
  const { consumer, bin } = c;
  const lint = sh(bin, ["lint", "--json"], { cwd: consumer });
  if (expectedWarnings({ acmart: UNBUILT })(lint)) {
    ok("`paperlint lint` passed the corpus clean");
  } else {
    bad("`paperlint lint` passed the corpus clean", lint.stdout + lint.stderr);
  }

  // `paperlint new` from the INSTALLED package: the templates must have shipped in the tarball, and
  // what they scaffold must be what `paperlint lint` accepts — exit 0, not "missing
  // PIPELINE-STATUS.md", with the one warning that no venue is chosen yet. Then the whole corpus
  // is linted again, now with the new paper in it.
  const fresh = sh(bin, ["new", "demo"], { cwd: consumer });
  if (
    fresh.status === 0 &&
    existsSync(join(consumer, "papers", "demo", "PIPELINE-STATUS.md")) &&
    existsSync(join(consumer, "papers", "demo", "paper.tex")) &&
    existsSync(join(consumer, "papers", "demo", "paperlint.json")) &&
    NO_PRESET.test(fresh.stdout) &&
    /\(0 errors, 1 warning\)/.test(fresh.stdout)
  ) {
    ok(
      "`paperlint new demo` scaffolds papers/demo from the shipped templates, paperlint.json included, and its lint passes with the one no-venue warning",
    );
  } else {
    bad(
      "`paperlint new demo` scaffolds papers/demo from the shipped templates, paperlint.json included, and its lint passes with the one no-venue warning",
      fresh.stdout + fresh.stderr,
    );
  }
  const withDemo = sh(bin, ["lint", "--json"], { cwd: consumer });
  if (expectedWarnings({ acmart: UNBUILT, demo: NO_PRESET })(withDemo)) {
    ok(
      "`paperlint lint` still passes the corpus clean with the new paper in it",
    );
  } else {
    bad(
      "`paperlint lint` still passes the corpus clean with the new paper in it",
      withDemo.stdout + withDemo.stderr,
    );
  }
}

function stepRealArticle(c: Consumer): void {
  const { consumer, bin } = c;
  // 🔴 THE REAL ARTICLE, AND IT IS NOT EXPECTED TO BE CLEAN. The two papers above were written
  // for the rules; this one was published before the rules existed, so it is the only input on
  // which a false positive can show up. It is added AFTER the clean run, and only its own files
  // are counted, so every finding below is the article's. The verdict is the recorded
  // baseline — growth fails, a full vanish fails, a partial drop does not — read through the
  // same module the in-repo harness uses, so the installed binary and the repository's own are
  // held to one recording.
  cpSync(
    join(ROOT, "fixtures", "real-markdown-paper"),
    join(consumer, "papers", "real-article"),
    { recursive: true, verbatimSymlinks: true },
  );
  const realLint = sh(bin, ["lint", "--json"], { cwd: consumer });
  let found: Counts | null = null;
  try {
    // Only the article's own files: the rest of the corpus is judged above.
    found = countByRule(
      JSON.stringify(
        LintFiles.parse(JSON.parse(realLint.stdout)).filter((f) =>
          f.filePath.includes(join("papers", "real-article")),
        ),
      ),
    );
  } catch (e) {
    bad(
      "`paperlint lint --json` on the real article parses",
      `${messageOf(e)}\n${realLint.stderr}`,
    );
  }
  if (found) {
    const { grew, vanished } = compareToBaseline(found);
    verdict(
      grew.length === 0 && vanished.length === 0,
      "the real article matches its baseline",
      [
        ...grew.map(
          (g) =>
            `grew: ${g.rule} ${String(g.now)} > recorded ${String(g.recorded)}`,
        ),
        ...vanished.map((r) => `vanished: ${r}`),
      ].join("\n"),
      `the real article matches its baseline (${Object.entries(found)
        .map(([r, n]) => `${r} ${String(n)}`)
        .join(", ")})`,
    );
  }
}

function stepHooksAndContent(c: Consumer): void {
  const { consumer, installed } = c;
  // 🔴 The load-bearing check: the commands ARE EXECUTED.
  const hooks = hookCommands(installed);
  if (hooks.err !== undefined) bad("hooks.json arrived and parses", hooks.err);
  else
    reportHooks(hooks.cmds, unresolvedHooks(hooks.cmds, consumer), {
      ok,
      bad,
    });

  // Content delivery: the skills, and the paths inside them.
  const d = contentDelivery(installed);
  if (d.missing.length === 0 && d.there === d.here) {
    ok(`all ${String(d.here)} skill(s) arrived`);
  } else {
    bad(
      `all ${String(d.here)} skill(s) arrived`,
      `${String(d.there)} arrived; missing: ${d.missing.join(", ") || "(count differs without a named gap)"}`,
    );
  }
  if (d.unresolved.length === 0) {
    ok(
      `all ${String(d.refs)} script path(s) named by skills resolve in the consumer`,
    );
  } else {
    bad(
      `all ${String(d.refs)} script path(s) named by skills resolve in the consumer`,
      [...new Set(d.unresolved)].slice(0, 5).join("\n"),
    );
  }
}

/**
 * A preset added by name travels in the tarball: `paperlint new --venue aidc` resolves
 * `paperlint:aidc` from the INSTALLED package's `presets/`, sets the new paper.tex in its class, and
 * `paperlint lint` judges the paper against it — the preset's required section is named, and no
 * finding says the preset did not resolve. Last: it adds a paper the corpus checks above do not count.
 */
function stepAidc(c: Consumer): void {
  const { consumer, bin } = c;
  const made = sh(
    bin,
    ["new", "preset-demo", "--venue", "aidc", "--kind", "short"],
    {
      cwd: consumer,
    },
  );
  const tex = join(consumer, "papers", "preset-demo", "paper.tex");
  verdict(
    existsSync(tex) &&
      readFileSync(tex, "utf8").includes(
        "\\documentclass[conference,compsoc]{IEEEtran}",
      ),
    "`paperlint new --venue aidc` resolves paperlint:aidc from the installed presets/ and sets its class",
    made.stdout + made.stderr,
  );
  const lint = sh(bin, ["lint", "papers/preset-demo", "--json"], {
    cwd: consumer,
  });
  let rules: (string | null)[] = [];
  try {
    rules = LintReport.parse(JSON.parse(lint.stdout)).flatMap((f) =>
      f.messages.map((m) => m.ruleId),
    );
  } catch {
    rules = ["(unparsable)"];
  }
  verdict(
    rules.includes("tex/required-section") && !rules.includes("pdf/profile"),
    "and `paperlint lint` judges it against paperlint:aidc: its required section is named, the preset resolves",
    JSON.stringify(rules) + lint.stderr,
  );
}

function stepTaken(c: Consumer, view: SkillView): void {
  const { consumer, bin } = c;
  // 🔴 A NAME THAT IS ALREADY TAKEN STAYS TAKEN. Last, because it deliberately breaks one
  // skill's link: the consumer's own directory under a shipped skill's name, plus one under a
  // name nobody ships. `init` must leave both byte for byte, say which skill it skipped, and
  // still exit zero — refusing to overwrite is not a failure of the install.
  const home = join(consumer, ".claude", "skills");
  const taken = view.names[0];
  if (taken) {
    // `force` + `recursive`: when init linked nothing, the entry is absent — say so below, do not crash here.
    rmSync(join(home, taken), { force: true });
    mkdirSync(join(home, taken), { recursive: true });
    writeFileSync(join(home, taken, "SKILL.md"), "the consumer's own\n");
    mkdirSync(join(home, "consumers-own-skill"), { recursive: true });
    writeFileSync(join(home, "consumers-own-skill", "SKILL.md"), "untouched\n");
    const third = sh(bin, ["init"], { cwd: consumer });
    const kept =
      readFileSync(join(home, taken, "SKILL.md"), "utf8") ===
        "the consumer's own\n" &&
      readFileSync(join(home, "consumers-own-skill", "SKILL.md"), "utf8") ===
        "untouched\n";
    verdict(
      kept &&
        third.status === 0 &&
        new RegExp(`${taken} — a directory`).test(third.stdout),
      `a foreign .claude/skills/${taken} is left untouched, named, and init still exits zero`,
      `kept=${String(kept)} exit=${String(third.status)}\n${third.stdout}`,
    );
  }
}
