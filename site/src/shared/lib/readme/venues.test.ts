import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { readmeContent, type Venue } from "./content.ts";
import { orList, presetName, venueGrid } from "./venues.ts";

const root = fileURLToPath(new URL("../../../../../", import.meta.url));
const read = (rel: string): string => readFileSync(root + rel, "utf8");

const DOC = `## What paperlint ships

### Families

| family | the template |
| --- | --- |
| \`paperlint:ieee-conference\` | IEEE \`IEEEtran\`, conference |
| \`paperlint:acl-latex\` | ACL's style files (\`article\`) |
| \`paperlint:neurips-style\` | \`article\` + \`\\usepackage{neurips_2026}\` |

### Editions, by field

**Software engineering**

| edition | parent | family | what is checked |
| --- | --- | --- | --- |
| \`paperlint:icse-2027\` | — | \`paperlint:ieee-conference\` | the format only |
| \`paperlint:agent-2027\` | \`paperlint:icse-2027\` | \`paperlint:ieee-conference\` | the workshop's call |

**Machine learning and AI**

| edition | parent | family | what is checked |
| --- | --- | --- | --- |
| \`paperlint:neurips-2026\` | — | \`paperlint:neurips-style\` | the main track's call |

**Human–computer interaction**: none shipped yet.

### In progress

**Not a field**

| edition | parent | family | what is checked |
| --- | --- | --- | --- |
| \`paperlint:iclr-2027\` | — | \`paperlint:iclr-style\` | nothing |
`;

const README: readonly Venue[] = [
  {
    preset: "paperlint:agent-2027",
    venue: "AGENT 2027 @ ICSE 2027",
    format: "IEEE two-column",
    limits: "full 8, short 5 pages",
  },
];

const NAMES: Readonly<Record<string, string>> = {
  "icse-2027": "ICSE",
  "agent-2027": "AGENT",
  "neurips-2026": "NeurIPS",
};
const nameOf = (id: string): string => NAMES[id] ?? `?${id}`;

describe("venueGrid", () => {
  it("groups the editions by field, each workshop under its conference, the README's limits first", () => {
    expect(venueGrid(DOC, README, nameOf)).toEqual({
      fields: [
        {
          field: "Software engineering",
          conferences: [
            {
              id: "icse-2027",
              series: "ICSE",
              name: "ICSE 2027",
              format: "IEEE IEEEtran, conference",
              limits: "Checked: the format only.",
              workshops: [
                {
                  id: "agent-2027",
                  series: "AGENT",
                  name: "AGENT 2027",
                  format: "IEEE two-column",
                  limits: "full 8, short 5 pages",
                },
              ],
            },
          ],
        },
        {
          field: "Machine learning and AI",
          conferences: [
            {
              id: "neurips-2026",
              series: "NeurIPS",
              name: "NeurIPS 2026",
              format: "article + \\usepackage{neurips_2026}",
              limits: "Checked: the main track's call.",
              workshops: [],
            },
          ],
        },
      ],
      families: ["IEEE", "ACL"],
    });
  });

  it("sets a workshop whose conference is in another field as a line of its own", () => {
    const doc = DOC.replace(
      "| `paperlint:neurips-2026` | — |",
      "| `paperlint:agent-2027` | `paperlint:icse-2027` | `paperlint:neurips-style` | the workshop's call |\n| `paperlint:neurips-2026` | — |",
    );
    expect(
      venueGrid(doc, [], nameOf).fields[1]?.conferences.map((c) => [
        c.name,
        c.workshops.length,
      ]),
    ).toEqual([
      ["AGENT 2027", 0],
      ["NeurIPS 2026", 0],
    ]);
  });

  it("reads the fields up to the end of the doc when no heading follows them", () => {
    const last = DOC.slice(0, DOC.indexOf("### In progress"));
    expect(venueGrid(last, README, nameOf)).toEqual(
      venueGrid(DOC, README, nameOf),
    );
  });

  it("fails the build when the doc is reshaped", () => {
    expect(() =>
      venueGrid(
        DOC.replace("### Editions, by field", "### Editions"),
        [],
        nameOf,
      ),
    ).toThrow('site: no "### Editions, by field"');
    expect(() =>
      venueGrid(DOC.replace(/^\*\*(.*)\*\*$/gm, "$1"), [], nameOf),
    ).toThrow("site: no field in docs/venues.md");
    expect(() =>
      venueGrid(
        DOC.replace("`paperlint:icse-2027` | —", "`icse-2027` | —"),
        [],
        nameOf,
      ),
    ).toThrow('site: "icse-2027" is not a paperlint: preset id');
    expect(() =>
      venueGrid(DOC.replaceAll("neurips-2026`", "neurips`"), [], nameOf),
    ).toThrow('site: "neurips" has no edition year');
    expect(() =>
      venueGrid(
        DOC.replace("| `paperlint:neurips-style` |", "| `paperlint:x` |"),
        [],
        nameOf,
      ),
    ).toThrow('names an unknown family "paperlint:neurips-style"');
    expect(() =>
      venueGrid(
        DOC.replace("IEEE `IEEEtran`", "`IEEEtran`").replace("ACL's", "the"),
        [],
        nameOf,
      ),
    ).toThrow("site: no ACM, IEEE or ACL family");
  });

  it("reads the real docs/venues.md and presets: every field, each workshop under its conference", () => {
    const readme = readmeContent(read("README.md")).venues;
    const grid = venueGrid(read("docs/venues.md"), readme, (id) =>
      presetName(read(`presets/${id}.jsonc`)),
    );
    expect(grid.fields.map((f) => f.field)).toEqual([
      "Software engineering",
      "Security",
      "Natural language processing",
      "Machine learning and AI",
    ]);
    expect(grid.families).toEqual(["ACM", "IEEE", "ACL"]);
    const nested = grid.fields.map((f) =>
      f.conferences.map((c) => [c.name, c.workshops.map((w) => w.series)]),
    );
    expect(nested[0]).toContainEqual([
      "ICSE 2027",
      ["NLBSE", "AGENT", "AGENTVERIFY"],
    ]);
    expect(nested[0]).toContainEqual(["ASE 2026", ["AgenticDev"]]);
    expect(nested[1]).toContainEqual(["ACM CCS 2026", ["AISec"]]);
    expect(nested[1]).toContainEqual(["ACSAC 2026", ["AIDC"]]);
    expect(nested[2]).toContainEqual(["EMNLP 2026", ["REALM"]]);
    expect(nested[2]).toContainEqual(["NAACL 2027", ["LangCode"]]);
    const agent = grid.fields[0]?.conferences
      .flatMap((c) => c.workshops)
      .find((w) => w.id === "agent-2027");
    expect(agent).toEqual({
      id: "agent-2027",
      series: "AGENT",
      name: "AGENT 2027",
      format: "IEEE IEEEtran, conference",
      limits: "Checked: the workshop's call.",
    });
  });
});

describe("presetName and orList", () => {
  it("reads a preset's series, and fails on a preset with none", () => {
    expect(presetName('{\n  "type": "venue",\n  "name": "IEEE S&P",\n}')).toBe(
      "IEEE S&P",
    );
    expect(() => presetName("{}")).toThrow('site: a preset with no "name"');
  });

  it("joins names as a sentence says them", () => {
    expect(orList([])).toBe("");
    expect(orList(["ACM"])).toBe("ACM");
    expect(orList(["ACM", "IEEE", "ACL"])).toBe("ACM, IEEE or ACL");
  });
});
