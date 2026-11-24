/**
 * `corpus/licence` through `paperlint lint`, the way a consumer runs it: off unless the root
 * `paperlint.json` turns it on, reported at the copy's `stored`, with the non-commercial setting as
 * the rule's own option.
 */
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { run } from "./cli.ts";
import { useTempDir, writeTree } from "../test/support.ts";

const STATUS = "---\nstages: []\n---\n# PIPELINE-STATUS\n";
const TEX = "\\documentclass{article}\n\\begin{document}\nx\n\\end{document}\n";
const PAPER = {
  "papers/p/PIPELINE-STATUS.md": STATUS,
  "papers/p/paper.tex": TEX,
};
const C = "papers/venues/agent";
const RECORD = `${C}/papers.json`;

/** A copy storing both kinds under `licence`. */
const copy = (licence: Readonly<Record<string, string>>) => ({
  version: "published",
  url: "https://doi.org/10.1/x",
  licence,
  stored: ["pdf", "text"],
  fetched_from: "https://doi.org/10.1/x",
});
const READ = { read_from: "https://example.org", read_on: "2026-11-03" };
const record = (licences: readonly Record<string, string>[]): string =>
  JSON.stringify(
    {
      venue: "agent",
      editions: [
        {
          edition: 2026,
          listed_from: "https://example.org/accepted",
          read_on: "2026-11-03",
          accepted: 1,
          capped: null,
          proxy: null,
        },
      ],
      papers: [
        {
          key: "a",
          edition: 2026,
          group: "accepted",
          title: "A",
          ids: { doi: "10.1/x" },
          copies: licences.map(copy),
        },
      ],
      rebuild: [],
    },
    null,
    2,
  );
/** The corpus whose stored files the record claims. */
const corpus = (licences: readonly Record<string, string>[]) => ({
  ...PAPER,
  [RECORD]: record(licences),
  [`${C}/pdf/a.pdf`]: "%PDF",
  [`${C}/text/a.txt`]: "a",
});
const ON = (options?: Readonly<Record<string, boolean>>) => ({
  "paperlint.json": JSON.stringify({
    rules: {
      "corpus/licence": options === undefined ? "warn" : ["warn", options],
    },
  }),
});

const Results = z.array(
  z.looseObject({
    filePath: z.string(),
    messages: z.array(
      z.looseObject({
        ruleId: z.string().nullable(),
        messageId: z.string().optional(),
        severity: z.number(),
        line: z.number().optional(),
        message: z.string(),
      }),
    ),
  }),
);

/** Every message of `corpus/licence`, with its file. */
async function licenceFindings(tree: Readonly<Record<string, string>>) {
  const dir = writeTree(useTempDir("paperlint-licence-"), {
    "package.json": '{"name":"consumer","private":true}',
    ...tree,
  });
  const out: string[] = [];
  const errs: string[] = [];
  const code = await run(["lint", "--json"], {
    cwd: dir,
    log: (...a: unknown[]) => out.push(a.join(" ")),
    err: (...a: unknown[]) => errs.push(a.join(" ")),
  });
  if (code !== 0 && out.length === 0) throw new Error(errs.join("\n"));
  return Results.parse(JSON.parse(out.join("\n"))).flatMap((r) =>
    r.messages
      .filter((m) => m.ruleId === "corpus/licence")
      .map((m) => ({ ...m, file: r.filePath.slice(dir.length + 1) })),
  );
}

describe("corpus/licence is off unless it is turned on", () => {
  it("🔴 says nothing about a corpus of forbidden and unread copies when no setting names it", async () => {
    // Guards: opt-in means silent; the same files are legal in a private repository.
    expect(
      await licenceFindings(
        corpus([
          { id: "LicenseRef-publisher", ...READ },
          { id: "NOASSERTION" },
        ]),
      ),
    ).toEqual([]);
  });

  it("reports each refused kind with warn, at the copy's stored line", async () => {
    const tree = corpus([{ id: "LicenseRef-publisher", ...READ }]);
    const found = await licenceFindings({ ...tree, ...ON() });
    const line =
      tree[RECORD].split("\n").findIndex((l) => l.includes('"stored"')) + 1;
    expect(found.map((m) => [m.file, m.severity, m.line, m.messageId])).toEqual(
      [
        [RECORD, 1, line, "forbidden"],
        [RECORD, 1, line, "forbidden"],
      ],
    );
  });

  it("names each message by what was refused", async () => {
    const found = await licenceFindings({
      ...corpus([
        { id: "NOASSERTION" },
        { id: "CC-BY-3.0", ...READ },
        { id: "CC-BY-NC-4.0", ...READ },
      ]),
      ...ON(),
    });
    expect(new Set(found.map((m) => m.messageId))).toEqual(
      new Set(["not-read", "unlisted", "non-commercial-only"]),
    );
  });

  it("is silent on a permitted licence even when turned on", async () => {
    expect(
      await licenceFindings({
        ...corpus([{ id: "CC-BY-4.0", ...READ }]),
        ...ON(),
      }),
    ).toEqual([]);
  });
});

describe("corpus/licence: turned on where there is no corpus", () => {
  it("🔴 is refused as a rule that reached nothing, not read as a pass", async () => {
    // Guards: an optional rule that is on and sees no file reports exactly like one that passed.
    await expect(licenceFindings({ ...PAPER, ...ON() })).rejects.toThrow(
      /corpus\/licence is turned on in "rules"/,
    );
  });
});

describe("corpus/licence: a record that does not parse is corpus/record's", () => {
  it("says nothing of its own about it", async () => {
    // Guards: no licence can be read from a record the schema refuses.
    expect(
      await licenceFindings({
        ...PAPER,
        ...ON(),
        [RECORD]: '{"venue":"agent"}',
      }),
    ).toEqual([]);
  });
});

describe("corpus/licence: the non-commercial setting is the rule's option", () => {
  const nc = corpus([{ id: "CC-BY-NC-4.0", ...READ }]);

  it("🔴 permits a non-commercial licence with nonCommercial: true", async () => {
    expect(
      await licenceFindings({ ...nc, ...ON({ nonCommercial: true }) }),
    ).toEqual([]);
  });

  it("refuses it with nonCommercial: false, as by default", async () => {
    expect(
      (await licenceFindings({ ...nc, ...ON({ nonCommercial: false }) })).map(
        (m) => m.messageId,
      ),
    ).toEqual(["non-commercial-only", "non-commercial-only"]);
  });

  it("refuses an option the rule does not have", async () => {
    // Guards: a misspelt option is ESLint's schema error, not a silent default.
    await expect(
      licenceFindings({ ...nc, ...ON({ noncommercial: true }) }),
    ).rejects.toThrow(/corpus\/licence/);
  });
});
