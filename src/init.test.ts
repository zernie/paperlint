/**
 * `paperlint init`: how the papers directory is decided and declared, the refusals over a
 * `paperlint.json` it cannot use, and each section of its report, asserted whole.
 *
 * The first block is the one this file was written for — a project that ALREADY declares its
 * papers directory: the declaration is the answer, and init reports it, not a directory it
 * discovered elsewhere and then did not use. Seen migrating a consumer project: init printed
 * "papers directory ✓ eslint-rules/fixtures — 4 candidates", then kept the declared papersDir.
 * The line described a decision that was not made.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FRESH_CLONE_NOTE } from "./hooks-settings.ts";
import {
  UNPINNED_REF,
  WORKFLOW_PATH,
  choosePapers,
  declarePapers,
  init,
  offerHooks,
  offerTexLive,
  reportHooks,
  reportSkillLinks,
  reportTexLive,
  reportWorkflow,
} from "./init.ts";
import { runNode } from "../test/support.ts";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** Declares `papersDir: "papers"`, and holds two OTHER directories that look like papers roots. */
function project(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "paperlint-init-")));
  dirs.push(root);
  const files: Record<string, string> = {
    "package.json": JSON.stringify({ name: "c", private: true }),
    "paperlint.json": JSON.stringify({ papersDir: "papers" }),
    "papers/a/PIPELINE-STATUS.md": "---\nstages: []\n---\n",
    "eslint-rules/fixtures/x/PIPELINE-STATUS.md": "---\nstages: []\n---\n",
    "eslint-rules/fixtures/y/paper.md": "# y\n",
    "drafts/z/paper.md": "# z\n",
  };
  for (const [p, text] of Object.entries(files)) {
    mkdirSync(join(root, p, ".."), { recursive: true });
    writeFileSync(join(root, p), text);
  }
  return root;
}

describe("paperlint init — a declared papers directory", () => {
  it("🔴 is the one reported, and no discovered candidate is named", async () => {
    const root = project();
    const out: string[] = [];
    const code = await init(root, {
      cwd: root,
      log: (s: string) => out.push(s),
      err: (s: string) => out.push(s),
      interactive: false,
      hooks: false,
      run: (() => ({ status: 0 })) as never,
      link: () => ({ ok: false, error: "not linked in this test" }),
    });
    const text = out.join("\n");
    const section = text.slice(
      text.indexOf("papers directory"),
      text.indexOf("settings"),
    );
    expect(code).toBe(0);
    expect(section).toMatch(/✓ papers — declared in paperlint\.json/);
    expect(section).not.toMatch(/candidates|eslint-rules|drafts/);
    const cfg: unknown = JSON.parse(
      readFileSync(join(root, "paperlint.json"), "utf8"),
    );
    expect(cfg).toEqual({ papersDir: "papers" });
  });

  it("is not asked about, even with a human at the terminal", async () => {
    const root = project();
    const asked: string[] = [];
    await init(root, {
      cwd: root,
      log: () => {},
      err: () => {},
      interactive: true,
      ask: (q) => Promise.resolve((asked.push(q), "n")),
      hooks: false,
      run: (() => ({ status: 0 })) as never,
      link: () => ({ ok: false, error: "not linked in this test" }),
    });
    expect(asked.filter((q) => /papers roots/.test(q))).toEqual([]);
  });

  it("without a declaration, the candidates are still measured and offered", async () => {
    const choice = await choosePapers(project(), { interactive: false });
    expect(choice.how).toBe("not-asked");
    expect(choice.candidates.length).toBeGreaterThan(1);
  });
});

describe("paperlint init — writes paperlint.json only when something differs from the default", () => {
  const quiet = {
    log: () => {},
    err: () => {},
    interactive: false,
    hooks: false,
    run: (() => ({ status: 0 })) as never,
    link: () => ({ ok: false as const, error: "not linked in this test" }),
  };
  const fresh = (files: Record<string, string>): string => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "paperlint-init-")));
    dirs.push(root);
    for (const [p, text] of Object.entries(files)) {
      mkdirSync(join(root, p, ".."), { recursive: true });
      writeFileSync(join(root, p), text);
    }
    return root;
  };

  it("🔴 papers/ is where the papers are: no paperlint.json is written", async () => {
    const root = fresh({ "papers/a/paper.tex": "x" });
    await init(root, { cwd: root, ...quiet });
    expect(existsSync(join(root, "paperlint.json"))).toBe(false);
  });

  it("nothing looks like papers: the default, and still no file", async () => {
    const root = fresh({ "README.md": "x" });
    await init(root, { cwd: root, ...quiet });
    expect(existsSync(join(root, "paperlint.json"))).toBe(false);
  });

  it("papers elsewhere: { papersDir } is written, and other keys already there are kept", async () => {
    const root = fresh({
      "docs/drafts/a/paper.tex": "x",
      "paperlint.json": '{ "kind": "short" }\n',
    });
    await init(root, { cwd: root, ...quiet });
    expect(
      JSON.parse(readFileSync(join(root, "paperlint.json"), "utf8")),
    ).toEqual({ kind: "short", papersDir: "docs/drafts" });
  });
});

/** Runs init in a fresh directory with the given TeX Live port; what it printed and asked. */
const texRun = async (
  tex: { installed: () => boolean; install?: () => number },
  { interactive, answer = "" }: { interactive: boolean; answer?: string },
) => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "paperlint-tex-")));
  dirs.push(root);
  const out: string[] = [];
  const asked: string[] = [];
  await init(root, {
    cwd: root,
    log: (s: string) => out.push(s),
    err: () => {},
    interactive,
    ask: (q) =>
      Promise.resolve((asked.push(q), /TeX Live/.test(q) ? answer : "")),
    hooks: false,
    run: (() => ({ status: 0 })) as never,
    link: () => ({ ok: false as const, error: "not linked in this test" }),
    tex,
  });
  return { text: out.join("\n"), asked };
};

describe("paperlint init — TeX Live is offered with its cost, never installed unasked", () => {
  it("🔴 no terminal: nothing is asked or installed, and the command is the next step", async () => {
    let installs = 0;
    const r = await texRun(
      { installed: () => false, install: () => (installs++, 0) },
      { interactive: false },
    );
    expect(installs).toBe(0);
    expect(r.asked.filter((q) => /TeX Live/.test(q))).toEqual([]);
    expect(r.text).toMatch(
      /npx paperlint toolchain {3}# ~270 MB, ~3 min, once/,
    );
    expect(r.text).toMatch(/next: .*\n.*npx paperlint toolchain/);
  });

  it("a human is asked, with the size in the question; yes installs once", async () => {
    let installs = 0;
    const r = await texRun(
      { installed: () => false, install: () => (installs++, 0) },
      { interactive: true, answer: "y" },
    );
    expect(r.asked.find((q) => /TeX Live/.test(q))).toMatch(
      /~270 MB, ~3 min, once\) \[y\/N\]/,
    );
    expect(installs).toBe(1);
    expect(r.text).not.toMatch(/next: .*\n.*npx paperlint toolchain/);
  });

  it("Enter is no — nothing installed", async () => {
    let installs = 0;
    const r = await texRun(
      { installed: () => false, install: () => (installs++, 0) },
      { interactive: true },
    );
    expect(installs).toBe(0);
    expect(r.text).toMatch(/declined — nothing installed/);
  });

  it("already installed: not asked about", async () => {
    const r = await texRun(
      { installed: () => true, install: () => 0 },
      { interactive: true, answer: "y" },
    );
    expect(r.asked.filter((q) => /TeX Live/.test(q))).toEqual([]);
    expect(r.text).toMatch(/✓ paperlint's TeX Live is installed/);
  });
});

/** A throwaway project from `{ path: contents }`. */
function tree(files: Record<string, string>): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "paperlint-init-")));
  dirs.push(root);
  for (const [p, text] of Object.entries(files)) {
    mkdirSync(join(root, p, ".."), { recursive: true });
    writeFileSync(join(root, p), text);
  }
  return root;
}

/** init with everything outside the papers step stubbed out; returns the code and both streams. */
async function initRun(
  root: string,
  opts: Parameters<typeof init>[1] = {},
): Promise<{ code: number; out: string[]; err: string[] }> {
  const out: string[] = [];
  const err: string[] = [];
  const code = await init(root, {
    cwd: root,
    log: (s: string) => out.push(s),
    err: (s: string) => err.push(s),
    interactive: false,
    hooks: false,
    run: (() => ({ status: 0 })) as never,
    link: () => ({ ok: false, error: "not linked in this test" }),
    ...opts,
  });
  return { code, out, err };
}

describe("paperlint init — a paperlint.json it cannot use stops it before anything is written", () => {
  it("unparsable: exit 2, the reason, and nothing written", async () => {
    const root = tree({ "paperlint.json": "{ nope" });
    const r = await initRun(root);
    expect(r.code).toBe(2);
    expect(r.err[0]).toMatch(/^ {2}✗ paperlint\.json is not valid JSON: /);
    expect(r.err.slice(1)).toEqual([
      "      nothing was written. The hooks read their papers directory from this file and",
      "      refuse every Bash command while it cannot be parsed — fix the JSON first.",
    ]);
    expect(readFileSync(join(root, "paperlint.json"), "utf8")).toBe("{ nope");
  });

  it("a papersDir that is not a string: exit 2, named", async () => {
    const root = tree({ "paperlint.json": '{ "papersDir": 7 }' });
    const r = await initRun(root);
    expect([r.code, r.err]).toEqual([
      2,
      [
        "  ✗ paperlint.json declares papersDir = 7 — it must be a directory path (a string)",
      ],
    ]);
  });

  it("a file without a trailing newline keeps having none", async () => {
    const root = tree({
      "paperlint.json": '{"x":1}',
      "drafts/a/paper.md": "# a\n",
    });
    const decl = await declarePapers(root, () =>
      choosePapers(root, { interactive: false }),
    );
    expect(decl.status).toBe("written");
    expect(readFileSync(join(root, "paperlint.json"), "utf8")).toBe(
      '{\n  "x": 1,\n  "papersDir": "drafts"\n}',
    );
  });
});

describe("paperlint init — how several candidate directories were decided, said", () => {
  const several = () =>
    tree({ "drafts/a/paper.md": "# a\n", "writing/b/paper.md": "# b\n" });
  const section = (out: string[]) =>
    out.slice(out.indexOf("papers directory") + 1, out.indexOf("settings") - 1);

  it("picked by a human", async () => {
    const r = await initRun(several(), {
      interactive: true,
      ask: () => Promise.resolve("2"),
    });
    expect(section(r.out)).toEqual([
      "  ✓ writing — you picked it out of 2 candidates",
    ]);
  });

  it("no terminal: the first, and the others named", async () => {
    const r = await initRun(several());
    expect(section(r.out)).toEqual([
      "  ✓ drafts — 2 candidates, stdin is not a terminal so nothing was asked",
      '      the others: writing — set "papersDir" in paperlint.json if this is the wrong one',
    ]);
  });

  it("an answer that picks nothing: the first, and said so", async () => {
    const r = await initRun(several(), {
      interactive: true,
      ask: () => Promise.resolve("nine"),
    });
    expect(section(r.out)[0]).toBe(
      "  ✓ drafts — 2 candidates, no answer was given, so the first one was taken",
    );
  });
});

const here = (p: string) => `<${p}>`;

describe("paperlint init — the workflow section, whole", () => {
  it("the workflow: written unpinned, kept, declined, not asked", () => {
    const ctx = { papersDir: "papers", why: "stdin is not a terminal" };
    expect(reportWorkflow("written", ctx)).toEqual([
      `  ✓ wrote ${WORKFLOW_PATH} — pin ${UNPINNED_REF} before pushing it`,
    ]);
    expect(reportWorkflow("written", { ...ctx, version: "1.2.3" })).toEqual([
      `  ✓ wrote ${WORKFLOW_PATH}, pinned to v1.2.3`,
    ]);
    expect(reportWorkflow("kept", ctx)).toEqual([
      `  ✓ ${WORKFLOW_PATH} is already there — kept, nothing overwritten`,
    ]);
    const step = [
      "      to run the same checks in CI, add this step to a workflow:",
      `        - uses: zernie/paperlint@${UNPINNED_REF}`,
      "          with:",
      "            paths: papers",
    ];
    expect(reportWorkflow("declined", ctx)).toEqual([
      "  · declined — nothing written",
      ...step,
    ]);
    expect(reportWorkflow("not-asked", ctx)).toEqual([
      "  · stdin is not a terminal, so nothing was asked. Default taken: NO file written.",
      ...step,
    ]);
  });
});

describe("paperlint init — the hooks section, whole", () => {
  it("the hooks: every outcome", () => {
    const how = "HOW";
    const r = (o: Parameters<typeof reportHooks>[0]) =>
      reportHooks(o, { how, here });
    expect(r({ status: "skipped" })).toEqual([
      "  · --no-hooks — nothing written",
    ]);
    expect(r({ status: "declined" })).toEqual([
      "  · declined — nothing written. `npx paperlint init` again wires them later",
    ]);
    expect(r({ status: "failed", reason: "no vigiles" })).toEqual([
      "  ✗ not wired — no vigiles",
      "      the hooks need vigiles to run at all; reinstall this package, then `npx paperlint init`",
    ]);
    expect(r({ status: "unparsable", path: "s.json", reason: "bad" })).toEqual([
      "  ✗ <s.json> does not parse — nothing written: bad",
    ]);
    expect(r({ status: "present", path: "s.json", names: ["a"] })).toEqual([
      "  ✓ already wired in <s.json> — nothing changed",
      "      HOW",
      `      ${FRESH_CLONE_NOTE}`,
    ]);
    expect(
      r({
        status: "foreign",
        path: "s.json",
        names: ["a", "b"],
        found: [{ name: "a", command: "node x.mjs" }],
        missing: ["b"],
      }),
    ).toEqual([
      "  ✓ already wired under another spelling in <s.json> — nothing written, so nothing runs twice:",
      "      a: node x.mjs",
      "  ⚠ and NOT wired in any form: b — add them in that same form",
      "      to switch to the form init writes, delete those commands and run `npx paperlint init` again",
    ]);
  });
});

describe("paperlint init — the skills section, whole", () => {
  it("the skills: nothing linked, and a mix with a skipped entry of unknown reason and a missing one", () => {
    expect(reportSkillLinks({ ok: false, error: "no package" }, here)).toEqual([
      "",
      "skills (Claude Code finds project skills in .claude/skills/, not in node_modules)",
      "  ⚠ nothing linked — no package",
      "      install the package into this project (`npm i -D …`), then `npx paperlint init` again",
    ]);
    expect(
      reportSkillLinks(
        {
          ok: true,
          home: "h",
          example: null,
          links: [
            { name: "a", status: "created" },
            { name: "b", status: "foreign" },
            { name: "c", status: "missing" },
          ],
        },
        here,
      ).slice(2),
    ).toEqual([
      "  ⚠ 3 shipped: 1 linked now, 0 already linked, 1 skipped, 1 NOT linked",
      "      left untouched — the name is taken by something paperlint did not make:",
      "        b — occupied",
      "      those skills are NOT available in Claude Code until the entry is moved or removed",
    ]);
  });
});

describe("paperlint init — TeX Live and hooks failures, whole", () => {
  it("TeX Live: a failed install says to run it again", async () => {
    const t = await offerTexLive(
      { installed: () => false, install: () => 1 },
      { interactive: true, ask: () => Promise.resolve("yes") },
    );
    expect([t, reportTexLive(t, "")]).toEqual([
      "failed",
      [
        "  ✗ the install failed — see above. Run it again:",
        "      npx paperlint toolchain   # ~270 MB, ~3 min, once",
      ],
    ]);
  });

  it("hooks: a merge that throws is a failed step, not a crash", async () => {
    const root = tree({});
    const outcome = await offerHooks(root, {
      hooks: true,
      interactive: false,
      merge: () => {
        throw new Error("merge exploded");
      },
    });
    expect(outcome).toEqual({ status: "failed", reason: "merge exploded" });
  });
});

describe("paperlint init — a first paper", () => {
  it("Enter at the name prompt skips it: nothing is created", async () => {
    const made: string[] = [];
    const r = await initRun(tree({}), {
      interactive: true,
      ask: () => Promise.resolve(""),
      createPaper: (_root, name) => Promise.resolve((made.push(name), 0)),
    });
    expect(made).toEqual([]);
    expect(r.out[r.out.indexOf("first paper") + 1]).toBe(
      "  · none yet. `npx paperlint new <name>` or `--paper <name>` creates one",
    );
  });
});

describe("paperlint init — paths are shown relative to where it was run", () => {
  it("a path that IS the working directory is shown whole, not as an empty string", async () => {
    const root = tree({ "papers/a/paper.md": "# a\n" });
    const home = join(root, ".claude", "skills");
    mkdirSync(home, { recursive: true });
    const r = await initRun(root, {
      cwd: home,
      link: () => ({
        ok: true,
        home,
        example: "../../node_modules/paperlint/skills/x",
        links: [{ name: "x", status: "present" }],
      }),
    });
    expect(r.out).toContain(
      `      ${join(home, "<name>")} → ../../node_modules/paperlint/skills/<name>`,
    );
  });
});

describe("askOnTerminal", () => {
  it("reads one line from stdin, and the question goes to stdout", () => {
    const probe = join(tree({}), "probe.mjs");
    writeFileSync(
      probe,
      `const { askOnTerminal } = await import(${JSON.stringify(join(import.meta.dirname, "init.ts"))});\n` +
        `console.log(JSON.stringify(await askOnTerminal("name? ")));\n`,
    );
    expect(runNode(probe, [], { input: "paper-one\n" })).toEqual({
      status: 0,
      stdout: 'name? "paper-one"\n',
      stderr: "",
    });
  });
});
