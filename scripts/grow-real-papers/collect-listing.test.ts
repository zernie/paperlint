/**
 * The collector on a Semantic Scholar listing: the listing's venue string is rule 1, an id arXiv
 * does not describe is rejected, and the edition the paper's own TeX declares beats the listing's year.
 */
import { describe, expect, test } from "vitest";
import type { Slot } from "./rules.ts";
import {
  BY,
  camera,
  fakeGet,
  feed,
  mainTex,
  queries,
  slot,
  tarGz,
  walk,
} from "./testkit.ts";

const s2Slot: Slot = { ...slot, source: "semantic-scholar", s2Venue: "ACL" };

describe("from a Semantic Scholar listing", () => {
  test("the listing's venue is rule 1, and an id arXiv does not describe is rejected", async () => {
    const listing = JSON.stringify({
      data: [
        { venue: "ACL", externalIds: { ArXiv: "s1" } },
        { venue: "ACL Workshop", externalIds: { ArXiv: "s2" } },
        { venue: "ACL", externalIds: { ArXiv: "s3" } },
      ],
    });
    const { get } = fakeGet([
      ["semanticscholar", listing],
      [
        "id_list=",
        feed([
          ["s2v1", ""],
          ["s3v1", ""],
        ]),
      ],
      ["arXiv.org:s3&", `<license>${BY}</license>`],
      ["src/s3v1", camera],
    ]);
    const r = await walk({ get, queries: queries({ slots: [s2Slot] }) });
    // Guards: each listed id's reason, and the kept one.
    expect(r.log).toEqual([
      [1, "s1", "rejected", "arXiv metadata missing for the listed id"],
      [
        2,
        "s2v1",
        "rejected",
        'S2 venue string is not the main proceedings: "ACL Workshop"',
      ],
      [3, "s3v1", "kept", "passes rules 1-4"],
    ]);
  });
});

describe("from a Semantic Scholar listing, the edition year", () => {
  test("a listed paper whose TeX declares another edition is rejected", async () => {
    const nextYear = tarGz([
      {
        name: "main.tex",
        body: mainTex(
          "Hi.",
          "\\documentclass{article}\\usepackage{acl}\n\\acmYear{2026}",
        ),
      },
    ]);
    const { get } = fakeGet([
      [
        "semanticscholar",
        JSON.stringify({
          data: [{ venue: "ACL", externalIds: { ArXiv: "s4" } }],
        }),
      ],
      ["id_list=", feed([["s4v1", ""]])],
      ["arXiv.org:s4&", `<license>${BY}</license>`],
      ["src/s4v1", nextYear],
    ]);
    const r = await walk({ get, queries: queries({ slots: [s2Slot] }) });
    // Guards: the listing's year loses to the edition the paper's own TeX declares.
    expect(r.log).toEqual([
      [
        1,
        "s4v1",
        "rejected",
        "the paper's TeX declares the 2026 edition (\\acmConference, \\acmYear), not ACL 2025",
      ],
    ]);
  });
});
