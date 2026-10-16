/**
 * The schemas of a blind study: a plan's `blind` and the manifest `sealed.json`. Both halves: what
 * the commands write parses back to itself, and every contradiction is refused with its reason —
 * never read as a blind study, or as an unsealed one.
 */
import { describe, expect, it } from "vitest";
import { manifestText, type SealManifest } from "../../domain/sealed-study.ts";
import { planText, type StudyPlan } from "../../domain/study-registry.ts";
import { studyRegistryCodec } from "./index.ts";

const R1 = `age1${"q".repeat(58)}`;
const R2 = `age1${"p".repeat(58)}`;

const PLAN: StudyPlan = {
  question: "Does the hint help?",
  population: {
    source: "tasks, 2026-10-01",
    draw: { kind: "all", method: "census" },
  },
  arms: [{ name: "hint" }, { name: "none" }],
  primary_outcome: "pass rate",
  author_check: null,
  blind: {
    recipients: [R1, R2],
    outputs: ["data/outcome/**", "RESULTS.md"],
    unseal_after: { file: "exclusions.md", note: "exclusions frozen" },
  },
};

const withBlind = (blind: unknown): string =>
  JSON.stringify({ ...PLAN, blind });
const why = (text: string): string => {
  const r = studyRegistryCodec.parsePlan(text);
  return r.kind === "unreadable" ? r.why : "parsed";
};

describe("a plan's blind", () => {
  it("parses to itself, and a plan without it is not blind", () => {
    // Guards: the field round-trips; absent is the one spelling of "not blind".
    expect(studyRegistryCodec.parsePlan(planText(PLAN))).toEqual({
      kind: "ready",
      plan: PLAN,
    });
    const { blind: _, ...open } = PLAN;
    expect(studyRegistryCodec.parsePlan(planText(open))).toEqual({
      kind: "ready",
      plan: open,
    });
  });

  it("refuses a decision file the outputs would seal", () => {
    // Guards: the gate cannot be sealed with the results — unsealing would wait forever.
    expect(
      why(
        withBlind({
          ...PLAN.blind,
          outputs: ["**/*.md"],
          unseal_after: { file: "exclusions.md", note: "n" },
        }),
      ),
    ).toBe(
      "blind.unseal_after.file: is matched by the output «**/*.md»: the decision would be sealed with the results",
    );
  });

  it("refuses a malformed or repeated recipient, and none at all", () => {
    // Guards: a key nobody holds, or a list that seals to no one, is no blind study.
    expect(
      why(withBlind({ ...PLAN.blind, recipients: ["ssh-ed25519 AAAA"] })),
    ).toBe(
      "blind.recipients.0: is not a native age recipient (age1 and 58 more characters, from age-keygen)",
    );
    expect(why(withBlind({ ...PLAN.blind, recipients: [R1, R1] }))).toBe(
      `blind.recipients: the recipient «${R1}» is listed more than once`,
    );
    expect(why(withBlind({ ...PLAN.blind, recipients: [] }))).toBe(
      "blind.recipients: Too small: expected array to have >=1 items",
    );
  });

  it("refuses an output outside the folder, or naming the study's own files", () => {
    const outside =
      "is not a path inside the study's folder, or names one of its own files (sealed.json, README.md, *.age)";
    // Guards: a glob cannot reach past the study's folder, nor seal its manifest, README or a ciphertext.
    expect(
      ["../x", "/abs", "a\\b", "sealed.json", "README.md", "x.age"].map((o) =>
        why(withBlind({ ...PLAN.blind, outputs: [o] })),
      ),
    ).toEqual(Array.from({ length: 6 }, () => `blind.outputs.0: ${outside}`));
    expect(why(withBlind({ ...PLAN.blind, outputs: ["a", "a"] }))).toBe(
      "blind.outputs: the output «a» is listed more than once",
    );
  });

  it("is closed: an unknown key, and a note left out, are errors", () => {
    // Guards: a misspelt key (`unseal_afer`) is not silently a study with no gate.
    expect(why(withBlind({ ...PLAN.blind, unseal_afer: {} }))).toBe(
      'blind: Unrecognized key: "unseal_afer"',
    );
    expect(
      why(withBlind({ ...PLAN.blind, unseal_after: { file: "x.md" } })),
    ).toBe(
      "blind.unseal_after.note: Invalid input: expected string, received undefined",
    );
  });

  it("is a field of the plan, so extra cannot carry it", () => {
    // Guards: one place says whether a study is blind.
    expect(
      why(JSON.stringify({ ...PLAN, blind: undefined, extra: { blind: {} } })),
    ).toBe(
      "extra.blind: is a field of the plan itself — set it there, not in extra",
    );
  });
});

const MANIFEST: SealManifest = {
  recipients: [R1],
  files: [
    {
      path: "RESULTS.md",
      sha256: "a".repeat(64),
      size: 3,
      age_sha256: "c".repeat(64),
      sealed_at: "2026-10-16T10:00:00.000Z",
    },
  ],
  unsealed: null,
};

const manifestWhy = (m: unknown): string => {
  const r = studyRegistryCodec.parseManifest(JSON.stringify(m));
  return r.ok ? "parsed" : r.why;
};

describe("a blind study's manifest, sealed.json", () => {
  it("what the commands write parses back, sealed and unsealed", () => {
    const unsealed: SealManifest = {
      ...MANIFEST,
      unsealed: {
        at: "2026-10-17T09:00:00.000Z",
        gate: {
          file: "exclusions.md",
          commit: "f".repeat(40),
          date: "2026-10-17T14:00:00+05:00",
        },
      },
    };
    // Guards: both states round-trip through the text the commands write.
    expect(studyRegistryCodec.parseManifest(manifestText(MANIFEST))).toEqual({
      ok: true,
      manifest: MANIFEST,
    });
    expect(studyRegistryCodec.parseManifest(manifestText(unsealed))).toEqual({
      ok: true,
      manifest: unsealed,
    });
  });

  it("refuses text that is not JSON", () => {
    // Guards: a broken file is a reason, not an empty manifest.
    expect(studyRegistryCodec.parseManifest("{")).toEqual({
      ok: false,
      why: "not JSON",
    });
  });

  it("refuses an unsealing without its gate, a flag in its place, and a repeated path", () => {
    // Guards: "unsealed" cannot be written down without the commit it waited for.
    expect(
      manifestWhy({
        ...MANIFEST,
        unsealed: { at: "2026-10-17T09:00:00.000Z" },
      }),
    ).toBe("unsealed.gate: Invalid input: expected object, received undefined");
    expect(manifestWhy({ ...MANIFEST, unsealed: true })).toBe(
      "unsealed: Invalid input: expected object, received boolean",
    );
    expect(
      manifestWhy({
        ...MANIFEST,
        files: [MANIFEST.files[0], MANIFEST.files[0]],
      }),
    ).toBe("files: the path «RESULTS.md» is listed more than once");
  });

  it("refuses a hash that is not one, and a commit that is not one", () => {
    const [f] = MANIFEST.files;
    // Guards: the record anyone verifies against is made of real digests.
    expect(manifestWhy({ ...MANIFEST, files: [{ ...f, sha256: "xyz" }] })).toBe(
      "files.0.sha256: is not a sha256",
    );
    expect(
      manifestWhy({
        ...MANIFEST,
        unsealed: {
          at: "2026-10-17T09:00:00.000Z",
          gate: {
            file: "e.md",
            commit: "HEAD",
            date: "2026-10-17T14:00:00+05:00",
          },
        },
      }),
    ).toBe("unsealed.gate.commit: is not a commit");
  });
});
