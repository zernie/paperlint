/**
 * `paperlint new` writes `<paper>/paperlint.json` — from the package's template, or from the
 * project's `<papers>/.template/` when it has one — with no venue chosen yet, which lint then names
 * in one warning instead of staying silent.
 */
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { newPaper, OVERRIDE_DIR, reportNewPaper } from "./new-paper.ts";
import { parsePaperSettings } from "./paper-settings.ts";
import { chooseVenue, run } from "./cli.ts";
import { shippedPresets } from "./presets.ts";
import { presetsDir } from "./package-dirs.ts";
import { lintReport } from "../test/lint-report.ts";
import { z } from "zod";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const tmp = () => {
  const d = realpathSync(mkdtempSync(join(tmpdir(), "paperlint-new-")));
  dirs.push(d);
  return d;
};
const settingsOf = (dir: string) =>
  z
    .record(z.string(), z.unknown())
    .parse(JSON.parse(readFileSync(join(dir, "paperlint.json"), "utf8")));

describe("paperlint new — the flat form, and the way to cycles", () => {
  // Decided 2026-10-05: `new` keeps writing the flat form, not `"cycles": []`. A cycle needs an
  // `opened` day (a clock `new` does not read) and an id, `--venue` and project templates write the
  // flat keys, and an empty list has no current cycle for pdf/measured's advice to name. What the
  // skills and the template's `$comment` teach instead is the conversion, pinned here.
  it("is the flat form, and turns into the cycles form by REPLACING `extends` — beside `cycles` even its null is refused", () => {
    const papers = join(tmp(), "papers");
    newPaper(papers, "demo", "tex", { venues: [] });
    const written = settingsOf(join(papers, "demo"));
    expect(parsePaperSettings(written).ok && "cycles" in written).toBe(false);
    const cycle = {
      id: "agenticdev-2026",
      venue: { kind: "preset", extends: "paperlint:agenticdev" },
      kind: "short",
      opened: "2026-10-05",
    };
    expect(parsePaperSettings({ ...written, cycles: [cycle] })).toEqual({
      ok: false,
      error:
        '"extends" beside "cycles": with cycles, it is the current attempt\'s and cannot be set here — move the value into the open cycle',
    });
    const rest = Object.fromEntries(
      Object.entries(written).filter(([k]) => k !== "extends"),
    );
    const converted = parsePaperSettings({ ...rest, cycles: [cycle] });
    expect(
      converted.ok && {
        extends: converted.value.extends,
        kind: converted.value.kind,
      },
    ).toEqual({ extends: "paperlint:agenticdev", kind: "short" });
  });
});

describe("paperlint new — paperlint.json", () => {
  it("is always written, from the package template: no venue chosen yet, and valid", () => {
    const papers = join(tmp(), "papers");
    const r = newPaper(papers, "demo", "tex", { venues: [] });
    expect(r.ok && r.files.find((f) => f.file === "paperlint.json")).toEqual({
      file: "paperlint.json",
      status: "created",
      from: "package",
    });
    const s = settingsOf(join(papers, "demo"));
    expect(s["extends"]).toBeNull();
    expect(String(s["$comment"])).toMatch(/paperlint:agenticdev/);
    expect(parsePaperSettings(s)).toEqual({
      ok: true,
      value: {
        extends: null,
        kind: null,
        pdf: null,
        rules: null,
        identity: null,
        talk: null,
        submission: null,
        cycles: null,
      },
    });
  });

  it("comes from the project's <papers>/.template/ when it has one", () => {
    const papers = join(tmp(), "papers");
    mkdirSync(join(papers, OVERRIDE_DIR), { recursive: true });
    writeFileSync(
      join(papers, OVERRIDE_DIR, "paperlint.json"),
      '{ "extends": "paperlint:aisec", "kind": "research" }\n',
    );
    const r = newPaper(papers, "house", "tex", { venues: [] });
    expect(r.ok && r.files.find((f) => f.file === "paperlint.json")?.from).toBe(
      "project",
    );
    expect(settingsOf(join(papers, "house"))).toEqual({
      extends: "paperlint:aisec",
      kind: "research",
    });
  });

  it("is never overwritten", () => {
    const papers = join(tmp(), "papers");
    mkdirSync(join(papers, "p"), { recursive: true });
    writeFileSync(
      join(papers, "p", "paperlint.json"),
      '{"extends":"paperlint:aisec"}',
    );
    const r = newPaper(papers, "p", "tex", { venues: [] });
    expect(
      r.ok && r.files.find((f) => f.file === "paperlint.json")?.status,
    ).toBe("kept");
    expect(settingsOf(join(papers, "p"))).toEqual({
      extends: "paperlint:aisec",
    });
  });
});

describe("paperlint lint — a paper with no venue preset chosen", () => {
  async function lintNew(extendsValue: string | null) {
    const root = tmp();
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({ name: "c", private: true }),
    );
    newPaper(join(root, "papers"), "demo", "tex", { venues: [] });
    if (extendsValue !== null)
      writeFileSync(
        join(root, "papers", "demo", "paperlint.json"),
        JSON.stringify({ extends: extendsValue, kind: "short" }),
      );
    const out: string[] = [];
    const code = await run(["lint", "--json"], {
      cwd: root,
      log: (s: string) => out.push(s),
      err: () => {},
    });
    const messages = lintReport(out.join("\n")).flatMap((r) => r.messages);
    return { code, messages };
  }

  it("gets exactly one warning naming the file to set, and exits 0", async () => {
    const { code, messages } = await lintNew(null);
    expect(code).toBe(0);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.ruleId).toBe("pdf/measured");
    expect(messages[0]?.severity).toBe(1);
    expect(messages[0]?.message).toMatch(/names no venue preset yet/);
    expect(messages[0]?.message).toMatch(
      /set "extends" in .*papers\/demo\/paperlint\.json/,
    );
  });

  it("a paper with a real extends does not get it", async () => {
    const { messages } = await lintNew("paperlint:agenticdev");
    expect(messages.map((m) => m.message).join("\n")).not.toMatch(
      /names no venue preset yet/,
    );
  });
});

/** `paperlint new <args>` in a fresh project (not a terminal: vitest's stdin is not a TTY). */
async function newIn(
  args: string[],
  files: Record<string, string> = {},
  name = "demo",
) {
  const root = tmp();
  const all = {
    "package.json": JSON.stringify({ name: "c", private: true }),
    ...files,
  };
  for (const [p, text] of Object.entries(all)) {
    mkdirSync(join(root, p, ".."), { recursive: true });
    writeFileSync(join(root, p), text);
  }
  const out: string[] = [];
  const err: string[] = [];
  const code = await run(["new", name, ...args], {
    cwd: root,
    log: (s: string) => out.push(s),
    err: (s: string) => err.push(s),
  });
  const dir = join(root, "papers", name);
  return {
    code,
    out: out.join("\n"),
    err: err.join("\n"),
    dir,
    settings: () => settingsOf(dir),
  };
}

describe("paperlint new --venue / --kind", () => {
  const PRESET = `{
  "type": "venue", "name": "my-workshop", "url": "https://example.org/cfp",
  "extends": "paperlint:acm-sigconf",
  "format": { "kinds": { "short": { "body_pages_max": 4 } } },
}
`;

  it("a shipped venue and its kind → extends and kind in paperlint.json, lint resolves it", async () => {
    const r = await newIn(["--venue", "agenticdev", "--kind", "short"]);
    expect(r.settings()).toEqual({
      extends: "paperlint:agenticdev",
      kind: "short",
    });
    expect(r.out).not.toMatch(/pdf\/profile/);
    expect(r.code).toBe(0);
  });

  it("🔴 the new paper.tex is set in the venue's class, so tex/template passes on what new wrote; the required section is named", async () => {
    const r = await newIn(["--venue", "aidc", "--kind", "regular"]);
    const tex = readFileSync(join(r.dir, "paper.tex"), "utf8");
    expect(tex).toContain("\\documentclass[conference,compsoc]{IEEEtran}\n");
    expect(tex).not.toContain("{article}");
    expect(r.out).not.toMatch(/tex\/template/);
    // What the stub still lacks is what AIDC requires of the text, and lint says so right away.
    expect(r.out).toMatch(/tex\/required-section/);
    expect(r.code).toBe(1);
  });

  it("a preset that names no template, or one no reader can read, leaves the template's class as it is", async () => {
    for (const template of [undefined, "\\documentclass[a]{}"]) {
      const r = await newIn(["--venue", "./venues/bare.jsonc"], {
        "venues/bare.jsonc": JSON.stringify({
          type: "family",
          ...(template === undefined ? {} : { template }),
          tex: { packages: { x: ["x.sty"] } },
        }),
      });
      expect(readFileSync(join(r.dir, "paper.tex"), "utf8")).toContain(
        "\\documentclass{article}",
      );
    }
  });

  it("🔴 a path is relative to where you run it, and written relative to the paper's file", async () => {
    const r = await newIn(
      ["--venue", "./venues/my-workshop.jsonc", "--kind", "short"],
      {
        "venues/my-workshop.jsonc": PRESET,
      },
    );
    // Guards: written as typed, `./venues/…` would name papers/demo/venues/…, which does not exist.
    expect(r.settings()).toEqual({
      extends: "../../venues/my-workshop.jsonc",
      kind: "short",
    });
    expect(r.out).not.toMatch(/pdf\/profile/);
    expect(r.code).toBe(0);
  });
});

describe("paperlint new --venue msr", () => {
  it("`new --venue msr` writes MSR's class line, and once the paper declares who wrote it, lint is clean", async () => {
    const r = await newIn(["--venue", "msr", "--kind", "technical"]);
    const tex = readFileSync(join(r.dir, "paper.tex"), "utf8");
    expect(tex).toContain("\\documentclass[10pt,conference]{IEEEtran}\n");
    expect(r.out).not.toMatch(/tex\/template|format\/page-limit|pdf\/profile/);
    // MSR reviews double-anonymously: the one thing the stub lacks is the authors' identity.
    expect(r.out).toMatch(/anonymity\/identity/);
    expect(r.code).toBe(1);
    writeFileSync(
      join(r.dir, "paperlint.json"),
      JSON.stringify({ ...r.settings(), identity: ["Ada Example"] }),
    );
    const out: string[] = [];
    const code = await run(["lint", r.dir], {
      cwd: r.dir,
      log: (s: string) => out.push(s),
      err: () => {},
    });
    // Guards: what remains is the reminder that the PDF is not built yet — a warning, not a finding
    // about the paper.
    expect(out.join("\n")).toMatch(/\(0 errors, 1 warning\)/);
    expect(out.join("\n")).toMatch(/pdf\/measured/);
    expect(code).toBe(0);
  });
});

describe("paperlint new --venue — a venue it cannot use", () => {
  it("an unknown venue exits 2, lists the shipped presets, and creates nothing", async () => {
    const r = await newIn(["--venue", "icse"]);
    expect(r.code).toBe(2);
    // Guards: the list is read from the shipped presets, the same list lint prints.
    expect(r.err).toContain(shippedPresets(presetsDir()).join(", "));
    expect(r.err).toMatch(/--venue icse: no such venue preset/);
    expect(existsSync(r.dir)).toBe(false);
  });
});

describe("paperlint new --venue / --kind — refusals and defaults", () => {
  it.each([
    [
      "a kind the preset lacks",
      ["--venue", "agenticdev", "--kind", "long"],
      /`AgenticDev` has no kind `long`; its kinds: short, full, demo/,
    ],
    ["a kind without a venue", ["--kind", "short"], /--kind needs --venue/],
    [
      "a kind for a preset with no kinds",
      ["--venue", "acm-sigconf", "--kind", "short"],
      /`acm-sigconf` has no kinds/,
    ],
    [
      "a path that does not exist",
      ["--venue", "./venues/nope.jsonc"],
      /no such file .* relative to where you run the command/,
    ],
  ])("%s → exit 2, nothing created", async (_, args, message) => {
    const r = await newIn(args);
    expect(r.err).toMatch(message);
    expect(r.code).toBe(2);
    expect(existsSync(r.dir)).toBe(false);
  });

  it("a venue with kinds and no --kind: written, and new says what lint will report", async () => {
    const r = await newIn(["--venue", "agenticdev"]);
    expect(r.settings()).toEqual({ extends: "paperlint:agenticdev" });
    expect(r.out).toMatch(
      /kind: not set — `AgenticDev` sets a page limit per kind/,
    );
    expect(r.out).toMatch(/pdf\/profile/);
  });

  it("without a terminal and no --venue: as before, and the hint names --venue", async () => {
    const r = await newIn([]);
    expect(r.settings()["extends"]).toBeNull();
    expect(r.out).toMatch(/venue: none yet .*--venue <preset>/);
    expect(r.code).toBe(0);
  });

  it("an existing paperlint.json is never overwritten: --venue is refused", async () => {
    const r = await newIn(["--venue", "aisec"], {
      "papers/demo/paperlint.json": '{ "extends": null }\n',
    });
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/already exists and is never overwritten/);
    // A file in the cycles form refuses a top-level "extends": the hint names the cycle too.
    expect(r.err).toMatch(/or, if it keeps "cycles", in a new cycle$/m);
    expect(r.settings()).toEqual({ extends: null });
  });
});

describe("paperlint new — a name that names a venue is refused", () => {
  it.each<[string, string, string[], string]>([
    [
      "a venue's label, with the work's name left to suggest",
      "aisec-agent-drift",
      [],
      '`aisec-agent-drift` — the paper folder names a venue ("AISec"); venues change on resubmission, so name it after the work (e.g. "agent-drift")',
    ],
    [
      "nothing but a year left: no example",
      "aisec-2026",
      [],
      '`aisec-2026` — the paper folder names a venue ("AISec"); venues change on resubmission, so name it after the work',
    ],
    [
      "its own venue too: right today, stale on the next resubmission",
      "aidc-2026",
      ["--venue", "aidc"],
      '`aidc-2026` — the paper folder names a venue ("AIDC"); venues change on resubmission, so name it after the work',
    ],
    [
      "by an alias, glued to a year",
      "acsac2026-rules",
      [],
      '`acsac2026-rules` — the paper folder names a venue ("ACSAC"); venues change on resubmission, so name it after the work',
    ],
    [
      "two venues",
      "realm-aisec-rules",
      [],
      '`realm-aisec-rules` — the paper folder names a venue ("AISec", "REALM"); venues change on resubmission, so name it after the work (e.g. "rules")',
    ],
  ])("%s: exit 2, nothing written", async (_, name, args, reason) => {
    const r = await newIn(args, {}, name);
    expect(r.code).toBe(2);
    expect(r.out).toBe(
      `  ✗ ${reason}\n    if the venue really belongs in the name, rerun \`paperlint new\` with --allow-venue-name`,
    );
    expect(existsSync(r.dir)).toBe(false);
  });

  it("an existing folder that names a venue gets no missing files either", async () => {
    const r = await newIn(
      [],
      { "papers/aisec-2026/paper.tex": "x" },
      "aisec-2026",
    );
    expect(r.code).toBe(2);
    expect(readdirSync(r.dir)).toEqual(["paper.tex"]);
  });

  it.each(["agent-rule-drift", "overrealm-realms"])(
    "%s names no venue: created, as before",
    async (name) => {
      const r = await newIn([], {}, name);
      expect(r.out).not.toMatch(/names a venue/);
      expect(existsSync(join(r.dir, "PIPELINE-STATUS.md"))).toBe(true);
      expect(r.code).toBe(0);
    },
  );
});

describe("paperlint new --allow-venue-name", () => {
  it("the folder is created as any other, and nothing is said about the venue", async () => {
    const r = await newIn(["--allow-venue-name"], {}, "realm-of-agents");
    expect(r.code).toBe(0);
    expect(r.out).not.toMatch(/venue really belongs|names a venue/);
    expect(readdirSync(r.dir).sort()).toEqual([
      "PIPELINE-STATUS.md",
      "paper.tex",
      "paperlint.json",
    ]);
  });

  it.each<{
    readonly what: string;
    readonly name: string;
    readonly args: readonly string[];
    readonly files: Record<string, string>;
    readonly says: RegExp;
  }>([
    {
      what: "an invalid name",
      name: "Realm",
      args: [],
      files: {},
      says: /may hold only a-z/,
    },
    {
      what: "an unknown preset",
      name: "realm-of-agents",
      args: ["--venue", "nope"],
      files: {},
      says: /no such venue preset/,
    },
    {
      what: "an existing paperlint.json with --venue",
      name: "realm-of-agents",
      args: ["--venue", "aisec"],
      files: {
        "papers/realm-of-agents/paperlint.json": '{ "extends": null }\n',
      },
      says: /already exists and is never overwritten/,
    },
  ])("skips no other refusal: $what", async ({ name, args, files, says }) => {
    const r = await newIn(["--allow-venue-name", ...args], files, name);
    expect(r.code).toBe(2);
    expect(`${r.out}\n${r.err}`).toMatch(says);
  });
});

describe("chooseVenue — on a terminal", () => {
  const at = (answers: string[]) => {
    const asked: string[] = [];
    return {
      asked,
      opts: {
        paperDir: "/p/papers/demo",
        cwd: "/p",
        interactive: true,
        ask: (q: string) =>
          Promise.resolve((asked.push(q), answers.shift() ?? "")),
      },
    };
  };

  it("asks the venue from the shipped list, then its kind", async () => {
    const t = at(["agenticdev", "full"]);
    const r = await chooseVenue({ venue: null, kind: null }, t.opts);
    expect(r).toMatchObject({
      ok: true,
      value: { extends: "paperlint:agenticdev", kind: "full" },
    });
    expect(t.asked[0]).toContain(
      [...shippedPresets(presetsDir()), "none"].join(" / "),
    );
    expect(t.asked[1]).toMatch(/kind: short \/ full \/ demo \/ later/);
  });

  it("the default answer is none: no venue written", async () => {
    const t = at([""]);
    expect(await chooseVenue({ venue: null, kind: null }, t.opts)).toEqual({
      ok: true,
      value: null,
    });
  });

  it("without a terminal nothing is asked", async () => {
    const t = at(["agenticdev"]);
    const r = await chooseVenue(
      { venue: null, kind: null },
      { ...t.opts, interactive: false },
    );
    expect(r).toEqual({ ok: true, value: null });
    expect(t.asked).toEqual([]);
  });
});

describe("a project's own template", () => {
  it("🔴 a template paperlint.json with comments refuses --venue by name, and nothing is made", () => {
    const papers = join(tmp(), "papers");
    mkdirSync(join(papers, OVERRIDE_DIR), { recursive: true });
    const src = join(papers, OVERRIDE_DIR, "paperlint.json");
    writeFileSync(src, '{\n  // our house venue\n  "extends": null\n}\n');
    const r = newPaper(papers, "p", "tex", {
      venues: [],
      venue: { extends: "paperlint:aisec", kind: null },
    });
    expect(r).toEqual({
      ok: false,
      reason: `--venue cannot be written into ${src}: it is not plain JSON — set "extends" by hand`,
    });
    expect(existsSync(join(papers, "p"))).toBe(false);
  });

  it("the report names where each created file came from", () => {
    const papers = join(tmp(), "papers");
    mkdirSync(join(papers, OVERRIDE_DIR), { recursive: true });
    writeFileSync(join(papers, OVERRIDE_DIR, "paperlint.json"), "{}\n");
    const lines = reportNewPaper(
      newPaper(papers, "p", "tex", { venues: [] }),
      (p) => p,
    );
    expect(lines).toContain(
      "      + paperlint.json  (from the project's .template/ template)",
    );
    expect(
      lines.filter((l) => l.endsWith("(from the package template)")).length,
    ).toBeGreaterThan(0);
  });
});
