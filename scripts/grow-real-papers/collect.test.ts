/**
 * The walk over a fake world: which candidates are judged, in what order, why each is rejected,
 * when an edition is full, and that quotas and caps count the whole manifest, earlier batches too.
 */
import { describe, expect, test } from "vitest";
import { targets, type Counted, type ProbeLine } from "./collect.ts";
import {
  ACCEPTED,
  BY,
  camera,
  fakeGet,
  feed,
  mainTex,
  queries,
  slot,
  tarGz,
  walk,
  type Route,
} from "./testkit.ts";

/** A world where each id has a licence and an e-print, and the search lists `listed` in order. */
function world(
  listed: readonly (readonly [string, string])[],
  papers: Readonly<Record<string, Readonly<{ licence?: Route; src?: Route }>>>,
) {
  const routes: (readonly [string, Route])[] = [
    ["api/query", feed(listed)],
    ...Object.entries(papers).flatMap(([id, p]) => [
      [`arXiv.org:${id}&`, p.licence ?? `<license>${BY}</license>`] as const,
      [`src/${id}`, p.src ?? camera] as const,
    ]),
  ];
  return fakeGet(routes);
}

describe("rules 1 to 4 in the fixed order", () => {
  test("each candidate's first failing rule is its reason; the first passing are kept", async () => {
    const big = mainTex(
      "x".repeat(300_001),
      "\\documentclass{article}\\usepackage{acl}",
    );
    const { get } = world(
      [
        ["p0", "Submitted to ACL 2025"],
        ["p1", ACCEPTED],
        ["p2", ACCEPTED],
        ["p3", ACCEPTED],
        ["p4", ACCEPTED],
        ["p5", ACCEPTED],
        ["p6", ACCEPTED],
        ["p7", ACCEPTED],
        ["p8", ACCEPTED],
        ["p9", ACCEPTED],
      ],
      {
        p1: { licence: { status: "503 after 4 attempts" } },
        p2: { licence: "<record/>" },
        p3: { src: { status: "403" } },
        p4: { src: "%PDF" },
        p5: { src: tarGz([{ name: "a.bib", body: "" }]) },
        p6: {
          src: tarGz([
            { name: "m.tex", body: mainTex("", "\\documentclass{revtex4}") },
          ]),
        },
        p7: { src: tarGz([{ name: "m.tex", body: big }]) },
        p8: {},
        p9: {},
      },
    );
    const r = await walk({ get, queries: queries({ quotas: { nlp: 1 } }) });
    // Guards: one reason per rule, in the order the rules run, and the walk stops when full.
    expect(r.log).toEqual([
      [1, "p0", "rejected", 'not accepted wording: comment says "Submitted"'],
      [2, "p1", "rejected", "download failed: OAI 503 after 4 attempts"],
      [3, "p2", "rejected", "licence arXiv default (none)"],
      [4, "p3", "rejected", "download failed: src 403"],
      [5, "p4", "rejected", "no source: not gzip (PDF-only submission)"],
      [6, "p5", "rejected", "no main .tex found"],
      [7, "p6", "rejected", "template: class revtex4, not article"],
      [
        8,
        "p7",
        "rejected",
        `>300KB of text sources (${String(big.length)} bytes)`,
      ],
      [9, "p8", "kept", "passes rules 1-4"],
    ]);
    // Guards: how the edition's walk ended, and where.
    expect(r.ends).toEqual([
      { slot: "nlp/ACL 2025", ended: "full", walkedTo: 9 },
    ]);
  });
});

describe("rule 1 read from the paper itself", () => {
  test("an accepted comment loses to a TeX that declares a companion track", async () => {
    const companion = tarGz([
      {
        name: "main.tex",
        body: mainTex(
          "Hi.",
          "\\documentclass{article}\\usepackage{acl}\n\\acmConference[ACL Companion '25]{Companion}{2025}{X}",
        ),
      },
    ]);
    const { get } = world([["p1", ACCEPTED]], { p1: { src: companion } });
    const r = await walk({ get, queries: queries() });
    // Guards: the check runs on a candidate found by its comment, not only on a listed one.
    expect(r.log).toEqual([
      [
        1,
        "p1",
        "rejected",
        "the paper's TeX declares a track that is not the main proceedings: \"ACL Companion '25\"",
      ],
    ]);
  });
});

describe("quotas and caps are totals over the manifest", () => {
  const earlier: readonly Counted[] = [
    { arxiv_id: "old1", field: "nlp", series: "ACL", year: 2024 },
    { arxiv_id: "old2", field: "nlp", series: "ACL", year: 2024 },
  ];
  const three = () =>
    world(
      [
        ["n1", ACCEPTED],
        ["n2", ACCEPTED],
        ["n3", ACCEPTED],
      ],
      { n1: {}, n2: {}, n3: {} },
    );

  test("a quota already met adds nothing and asks nothing", async () => {
    const { get, asked } = three();
    const r = await walk({
      get,
      entries: earlier,
      queries: queries({ quotas: { nlp: 2 } }),
    });
    // Guards: two earlier nlp papers fill a quota of 2; no request is made.
    expect([r.kept, r.ends, asked]).toEqual([[], [], []]);
  });

  test("a raised quota adds only the difference", async () => {
    const { get } = three();
    const r = await walk({
      get,
      entries: earlier,
      queries: queries({ quotas: { nlp: 3 } }),
    });
    // Guards: quota 3 with 2 earlier papers keeps exactly one.
    expect(r.kept).toEqual(["n1"]);
  });

  test("an edition holds at most its round's target, round-robin up to 5", async () => {
    const { get } = three();
    const fullEdition: readonly Counted[] = Array.from(
      { length: 5 },
      (_, i) => ({
        arxiv_id: `e${String(i)}`,
        series: "ACL",
        year: 2025,
      }),
    );
    const r = await walk({ get, entries: fullEdition });
    // Guards: five papers of ACL 2025 already, so the edition takes no more.
    expect([r.kept, r.ends]).toEqual([[], []]);
    // Guards: the rounds: cap 1 then 2…5 for one slot, a slot at 5 only in round 0.
    expect(
      targets([slot, { ...slot, series: "EMNLP", cap: 5 }], 5).map(
        ([s, t]) => `${s.series} ${String(t)}`,
      ),
    ).toEqual(["ACL 1", "EMNLP 5", "ACL 2", "ACL 3", "ACL 4", "ACL 5"]);
  });
});

const logged = (
  id: string,
  reason: string,
  outcome: "kept" | "rejected" = "rejected",
): ProbeLine => ({
  id,
  field: "nlp",
  series: "ACL",
  year: 2025,
  rank: 1,
  query: "q",
  source: "arxiv-comment",
  acceptance: "arxiv-comment",
  outcome,
  reason,
});

describe("a run resumes, skips and stops", () => {
  test("a judged candidate is not judged again, a failed download is; a taken id is skipped", async () => {
    const { get } = world(
      [
        ["a1", ACCEPTED],
        ["a2v2", ACCEPTED],
        ["a3", ACCEPTED],
        ["a4", ACCEPTED],
        ["a5", ACCEPTED],
      ],
      { a1: {}, a2: {}, a3: {}, a4: {}, a5: {} },
    );
    const r = await walk({
      get,
      queries: queries({ quotas: { nlp: 2 }, hardCap: 1 }),
      otherIds: new Set(["a2"]),
      logged: [
        logged("a1", "licence arXiv default (none)"),
        logged("a3", "download failed: src 503"),
        logged("a4", "passes rules 1-4", "kept"),
      ],
    });
    // Guards: a1 and a4 stand as judged; a2 is a preprint already; a3's failed download is retried.
    expect([r.log, r.ends]).toEqual([
      [
        [2, "a2v2", "rejected", "already in the corpora"],
        [3, "a3", "kept", "passes rules 1-4"],
      ],
      [{ slot: "nlp/ACL 2025", ended: "full", walkedTo: 3 }],
    ]);
  });

  test("the time box stops the whole run; an exhausted edition moves on", async () => {
    const { get } = world([["t1", "no"]], {});
    const two = queries({
      slots: [slot, { ...slot, series: "EMNLP", venue: "emnlp" }],
    });
    const ticks = { n: 0 };
    const r = await walk({ get, queries: two, outOfTime: () => ++ticks.n > 1 });
    // Guards: the first edition ran out of candidates, the second hit the deadline; nothing after it.
    expect(r.ends).toEqual([
      { slot: "nlp/ACL 2025", ended: "exhausted", walkedTo: 1 },
      { slot: "nlp/EMNLP 2025", ended: "time", walkedTo: 0 },
    ]);
  });

  test("a search error ends the edition; --only and a field without a quota", async () => {
    const failing = fakeGet([["api/query", { status: "503" }]]);
    const r = await walk({ get: failing.get });
    // Guards: the error is the edition's end.
    expect(r.ends).toEqual([
      {
        slot: "nlp/ACL 2025",
        ended: "search error",
        walkedTo: 0,
        error: 'co:"ACL 2025" page 0: 503',
      },
    ]);
    const other = queries({ slots: [slot, { ...slot, field: "ml" }] });
    // Guards: --only leaves the other field out, and a field with no quota (ml) walks nothing.
    expect(
      (await walk({ get: failing.get, queries: other, only: ["ml"] })).ends,
    ).toEqual([]);
  });
});
