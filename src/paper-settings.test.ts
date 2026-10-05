/**
 * `<paper>/paperlint.json` — the per-paper settings file: parsed strictly, merged over the root
 * `paperlint.json`'s defaults, and `rules` turned into an ESLint block for that paper alone.
 */
import { describe, expect, it } from "vitest";
import { memoryFiles } from "./adapters/memory/index.ts";
import { absolutePath } from "./domain/paths.ts";
import { findProjectRoot } from "../lib/paper-config.ts";
import {
  paperRules,
  parsePaperSettings,
  readPaperSettings,
} from "./paper-settings.ts";

const PAPER = "/work/papers/p";
const SHIPPED = new Set([
  "pdf/last-page-balance",
  "pdf/profile",
  "paper/section-word",
]);

describe("parsePaperSettings", () => {
  it("reads extends, kind, pdf and rules; every absent field is null", () => {
    expect(
      parsePaperSettings({ extends: "paperlint:aisec", kind: "research" }),
    ).toEqual({
      ok: true,
      value: {
        extends: "paperlint:aisec",
        kind: "research",
        pdf: null,
        rules: null,
        identity: null,
        talk: null,
        submission: null,
        cycles: null,
      },
    });
    expect(parsePaperSettings({})).toEqual({
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

  it("extends: null is valid and means no venue chosen yet — what `paperlint new` writes", () => {
    expect(parsePaperSettings({ extends: null })).toEqual({
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
});

describe("parsePaperSettings — optional keys", () => {
  it("accepts $comment, JSON Schema's comment keyword, and ignores it", () => {
    expect(
      parsePaperSettings({ extends: "paperlint:aisec", $comment: "why" }).ok,
    ).toBe(true);
  });

  it.each([
    [
      "an unknown key (a typo is not silent)",
      { venu: "aisec" },
      /unknown key "venu" — known keys: papersDir, structure, rules, extends, kind, pdf/,
    ],
    [
      "a comment key other than `$comment`",
      { extends: "paperlint:aisec", _: "note" },
      /unknown key "_"/,
    ],
    [
      "an extends that is not a string",
      { extends: 3 },
      /"extends" must be a non-empty string/,
    ],
    [
      "an empty extends",
      { extends: "" },
      /"extends" must be a non-empty string/,
    ],
    [
      "rules that are neither an object nor a list of blocks",
      { rules: "pdf/profile" },
      /"rules" must be an object/,
    ],
    [
      "🔴 papersDir — a project setting, refused in a paper's file",
      { papersDir: "papers" },
      /"papersDir" is a project setting — set it in the root paperlint\.json/,
    ],
    ["not an object at all", ["aisec"], /must be a JSON object/],
  ])("refuses %s", (_, json, why) => {
    const r = parsePaperSettings(json);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(why);
  });
});

describe("readPaperSettings", () => {
  it("no file: null — the paper declares nothing", () => {
    expect(readPaperSettings(memoryFiles(), PAPER)).toEqual({
      ok: true,
      value: null,
    });
  });

  it("reads paperlint.json", () => {
    const files = memoryFiles({
      [`${PAPER}/paperlint.json`]: '{"extends":"paperlint:aisec"}',
    });
    const r = readPaperSettings(files, PAPER);
    expect(r.ok && r.value?.extends).toBe("paperlint:aisec");
  });

  it("not JSON: broken, with the parser's reason", () => {
    const files = memoryFiles({
      [`${PAPER}/paperlint.json`]: "{ extends: aisec",
    });
    const r = readPaperSettings(files, PAPER);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("broken");
  });
});

describe("readPaperSettings — a root paperlint.json that cannot be used", () => {
  const ROOT = "/work";
  const withFiles = (f: Record<string, string>) =>
    memoryFiles({ [`${ROOT}/package.json`]: "{}", ...f });

  it("a root file that does not parse, or names a field of the wrong type, is the paper's problem too", () => {
    const broken = (root: string) =>
      readPaperSettings(withFiles({ [`${ROOT}/paperlint.json`]: root }), PAPER);
    const notJson = broken("{ nope");
    expect(!notJson.ok && notJson.error.kind).toBe("broken");
    const why: unknown = expect.stringMatching(
      /^the root paperlint\.json: .*kind/,
    );
    expect(broken('{"kind":3}')).toEqual({
      ok: false,
      error: { kind: "broken", why },
    });
  });
});

/** The fields a case does not set. */
const UNSET = {
  pdf: null,
  rules: null,
  identity: null,
  talk: null,
  submission: null,
  cycles: null,
};

describe("readPaperSettings — the root paperlint.json's defaults, the paper's file over them", () => {
  const ROOT = "/work";
  const withFiles = (f: Record<string, string>) =>
    memoryFiles({ [`${ROOT}/package.json`]: "{}", ...f });
  const read = (f: Record<string, string>) => {
    const r = readPaperSettings(withFiles(f), PAPER);
    if (!r.ok) throw new Error(r.error.why);
    return r.value;
  };

  it("no file at either level: null", () => {
    expect(read({})).toBeNull();
  });

  it("root only: its extends and kind are this paper's", () => {
    expect(
      read({
        [`${ROOT}/paperlint.json`]:
          '{"papersDir":"papers","extends":"paperlint:agenticdev","kind":"short"}',
      }),
    ).toEqual({
      extends: "paperlint:agenticdev",
      kind: "short",
      ...UNSET,
    });
  });

  it("paper only: its own values", () => {
    expect(
      read({ [`${PAPER}/paperlint.json`]: '{"extends":"paperlint:aisec"}' }),
    ).toEqual({
      extends: "paperlint:aisec",
      kind: null,
      ...UNSET,
    });
  });

  it("🔴 both: the paper's value wins, an absent one falls back to the root's, and `\"extends\": null` is absent", () => {
    expect(
      read({
        [`${ROOT}/paperlint.json`]:
          '{"extends":"paperlint:agenticdev","kind":"short","rules":{"pdf/profile":"off"}}',
        [`${PAPER}/paperlint.json`]:
          '{"extends":null,"kind":"research","rules":{"pdf/fonts":"off"}}',
      }),
    ).toEqual({
      extends: "paperlint:agenticdev",
      kind: "research",
      pdf: null,
      // The root's rules are the project's blocks (cli.ts), not this paper's.
      rules: { "pdf/fonts": "off" },
      identity: null,
      talk: null,
      submission: null,
      cycles: null,
    });
  });
});

describe("readPaperSettings — a project key in a paper's file", () => {
  const withFiles = (f: Record<string, string>) =>
    memoryFiles({ "/work/package.json": "{}", ...f });

  it("papersDir in a paper's file: broken, naming the root file as its place", () => {
    const r = readPaperSettings(
      withFiles({ [`${PAPER}/paperlint.json`]: '{"papersDir":"x"}' }),
      PAPER,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.why).toMatch(/project setting/);
  });
});

describe("findProjectRoot — where the root paperlint.json is looked for", () => {
  const ROOT = "/work";
  const withFiles = (f: Record<string, string>) =>
    memoryFiles({ [`${ROOT}/package.json`]: "{}", ...f });

  it("🔴 from INSIDE a paper, the project root is not the paper: its paperlint.json sits beside paper.tex", () => {
    const files = withFiles({
      [`${PAPER}/paper.tex`]: "x",
      [`${PAPER}/paperlint.json`]: '{"kind":"research"}',
      [`${ROOT}/paperlint.json`]: '{"extends":"paperlint:aisec"}',
    });
    const isFile = (p: string) => files.isFile(absolutePath(p));
    expect(findProjectRoot(PAPER, isFile)).toBe(ROOT);
    // No root file anywhere: the package.json directory.
    expect(findProjectRoot(PAPER, (p) => p === `${ROOT}/package.json`)).toBe(
      ROOT,
    );
    // Neither: where the walk started.
    expect(findProjectRoot(PAPER, () => false)).toBe(PAPER);
  });
});

describe("paperRules — `rules` in paperlint.json", () => {
  const settings = (rules: Record<string, unknown> | null) => ({
    extends: null,
    kind: null,
    pdf: null,
    rules,
    identity: null,
    talk: null,
    submission: null,
    cycles: null,
  });

  it("no rules: none", () => {
    expect(paperRules(PAPER, settings(null), SHIPPED)).toEqual({
      ok: true,
      value: null,
    });
  });

  it("known rules, parsed", () => {
    expect(
      paperRules(
        PAPER,
        settings({ "pdf/last-page-balance": "error" }),
        SHIPPED,
      ),
    ).toEqual({ ok: true, value: { "pdf/last-page-balance": "error" } });
  });

  it.each([
    [
      "an unknown rule id",
      { "pdf/no-such-rule": "error" },
      /"pdf\/no-such-rule" is not a rule paperlint ships/,
    ],
    ["a bad severity", { "pdf/profile": "loud" }, /is not a severity/],
  ])("refuses %s, naming the file", (_, rules, why) => {
    const r = paperRules(PAPER, settings(rules), SHIPPED);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(why);
      expect(r.error).toMatch(/paperlint\.json/);
    }
  });
});

describe("readPaperSettings — identity, at both levels", () => {
  const ROOT = "/work";
  const withFiles = (f: Record<string, string>) =>
    memoryFiles({ [`${ROOT}/package.json`]: "{}", ...f });
  const read = (f: Record<string, string>) => {
    const r = readPaperSettings(withFiles(f), PAPER);
    if (!r.ok) throw new Error(r.error.why);
    return r.value;
  };

  it("identity: the root's list and the paper's, joined without repeats", () => {
    expect(
      read({
        [`${ROOT}/paperlint.json`]: '{"identity":["Ada Example","adaexample"]}',
        [`${PAPER}/paperlint.json`]:
          '{"identity":["adaexample","Bob Coauthor"]}',
      })?.identity,
    ).toEqual(["Ada Example", "adaexample", "Bob Coauthor"]);
    expect(
      read({ [`${ROOT}/paperlint.json`]: '{"identity":["Ada Example"]}' })
        ?.identity,
    ).toEqual(["Ada Example"]);
  });

  it("identity of the wrong shape, at either level, is refused naming it", () => {
    const why = (f: Record<string, string>) => {
      const r = readPaperSettings(withFiles(f), PAPER);
      return r.ok ? "" : r.error.why;
    };
    expect(why({ [`${PAPER}/paperlint.json`]: '{"identity":"Ada"}' })).toMatch(
      /"identity" must be a list of strings/,
    );
    expect(why({ [`${PAPER}/paperlint.json`]: '{"identity":["  "]}' })).toMatch(
      /"identity" must be a list of strings, each with a letter or digit/,
    );
    expect(why({ [`${ROOT}/paperlint.json`]: '{"identity":[3]}' })).toMatch(
      /^the root paperlint\.json: "identity" must be/,
    );
  });
});

describe("talk in a paper's paperlint.json", () => {
  it("is parsed into the paper's settings", () => {
    const r = parsePaperSettings({ talk: { mode: "remote-video" } });
    expect(r.ok && r.value.talk?.mode).toBe("remote-video");
  });

  it("refuses a talk it cannot parse, naming the key", () => {
    const r = parsePaperSettings({ talk: { mode: "zoom" } });
    expect(r.ok ? "" : r.error).toMatch(/"talk.mode"/);
  });
});

describe("parsePaperSettings — `cycles`: the current attempt supplies extends, kind and submission", () => {
  const closed = {
    id: "alpha-2026",
    venue: { kind: "preset", extends: "paperlint:acm-sigconf" },
    kind: "short",
    opened: "2026-07-01",
    outcome: {
      kind: "rejected",
      date: "2026-09-08",
      desk: true,
      evidence: "reviews/alpha.md",
    },
  };
  const open = {
    id: "beta-2027",
    venue: { kind: "preset", extends: "paperlint:ieee-conference" },
    kind: "technical",
    opened: "2026-09-09",
    submission: { id: 52 },
    outcome: { kind: "open" },
  };
  const settingsOf = (json: unknown) => {
    const r = parsePaperSettings(json);
    if (!r.ok) throw new Error(r.error);
    return r.value;
  };

  it("an open cycle: its venue, kind and submission are the paper's", () => {
    const s = settingsOf({ cycles: [closed, open] });
    expect(s.extends).toBe("paperlint:ieee-conference");
    expect(s.kind).toBe("technical");
    expect(s.submission).toEqual({ id: 52 });
    expect(s.cycles?.current.kind).toBe("cycle");
    expect(s.cycles?.list.map((c) => c.id)).toEqual([
      "alpha-2026",
      "beta-2027",
    ]);
  });

  it("parked (the last cycle closed) and none (`cycles: []`): no venue, as `extends: null` reads", () => {
    const parked = settingsOf({ cycles: [closed] });
    expect([parked.extends, parked.kind, parked.submission]).toEqual([
      null,
      null,
      null,
    ]);
    expect(parked.cycles?.current.kind).toBe("parked");
    expect(settingsOf({ cycles: [] }).cycles?.current).toEqual({
      kind: "none",
    });
  });
});

describe("parsePaperSettings — `cycles`, closed and named", () => {
  const closed = {
    id: "alpha-2026",
    venue: { kind: "preset", extends: "paperlint:acm-sigconf" },
    kind: "short",
    opened: "2026-07-01",
    outcome: { kind: "withdrawn", date: "2026-09-08", evidence: "n.md" },
  };
  const open = {
    id: "beta-2027",
    venue: { kind: "preset", extends: "paperlint:ieee-conference" },
    kind: "technical",
    opened: "2026-09-09",
  };
  const settingsOf = (json: unknown) => {
    const r = parsePaperSettings(json);
    if (!r.ok) throw new Error(r.error);
    return r.value;
  };

  it("an accepted last cycle keeps its venue and kind: camera-ready and talk are judged against it", () => {
    const accepted = { kind: "accepted", date: "2026-08-21", evidence: "r.md" };
    const s = settingsOf({ cycles: [{ ...closed, outcome: accepted }] });
    expect([s.extends, s.kind, s.cycles?.current.kind]).toEqual([
      "paperlint:acm-sigconf",
      "short",
      "accepted",
    ]);
  });

  it("a named venue (no preset yet) resolves no preset: extends is null, the record stays", () => {
    const venue = {
      kind: "named",
      name: "X '27",
      url: "https://example.org/c",
    };
    const s = settingsOf({ cycles: [{ ...open, venue }] });
    expect([s.extends, s.kind]).toEqual([null, "technical"]);
  });
});

describe("parsePaperSettings — `cycles` refused", () => {
  const open = {
    id: "beta-2027",
    venue: { kind: "preset", extends: "paperlint:ieee-conference" },
    opened: "2026-09-09",
  };
  const alsoOpen = {
    id: "alpha-2026",
    venue: { kind: "preset", extends: "paperlint:acm-sigconf" },
    opened: "2026-07-01",
  };

  it("one derived key beside `cycles` is refused in the singular", () => {
    expect(parsePaperSettings({ kind: "short", cycles: [open] })).toEqual({
      ok: false,
      error: expect.stringMatching(
        /^"kind" beside "cycles": with cycles, it is the current attempt's/,
      ) as unknown,
    });
  });

  it("a derived key written beside `cycles` is refused, naming it — two sources for one fact", () => {
    const error: unknown = expect.stringMatching(
      /^"extends", "kind" beside "cycles": with cycles, they are the current attempt's/,
    );
    expect(
      parsePaperSettings({
        extends: "paperlint:acm-sigconf",
        kind: "short",
        cycles: [open],
      }),
    ).toEqual({ ok: false, error });
  });

  it("two open cycles is refused as the file's problem: dual submission has no current venue", () => {
    const error: unknown = expect.stringMatching(
      /are both open — a paper is on one attempt/,
    );
    expect(parsePaperSettings({ cycles: [alsoOpen, open] })).toEqual({
      ok: false,
      error,
    });
  });

  it("a malformed cycle is refused with the entry and key, through readPaperSettings as `broken`", () => {
    const files = memoryFiles({
      "/work/package.json": "{}",
      [`${PAPER}/paperlint.json`]: JSON.stringify({
        cycles: [{ ...open, opened: "soon" }],
      }),
    });
    const why: unknown = expect.stringMatching(
      /^cycles\[0\]: "opened" must be a date/,
    );
    expect(readPaperSettings(files, PAPER)).toEqual({
      ok: false,
      error: { kind: "broken", why },
    });
  });
});
