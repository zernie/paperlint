/** `judgeDeclaredVenue`: what the paper's own ACM preamble says it is, on both halves. */
import { describe, expect, test } from "vitest";
import { judgeDeclaredVenue } from "./declared-venue.ts";

type Own = Readonly<{ series: string; year: number }>;

const slot: Own = { series: "EuroSys", year: 2025 };

describe("what the TeX declares is rejected when it is not the slot", () => {
  test("an ACM edition year other than the slot's is rejected", () => {
    // Guards: a listing's 2025 that the paper's own \\acmConference says is the 2026 edition.
    expect(
      judgeDeclaredVenue(
        "\\acmYear{2026}\n\\acmConference[EUROSYS '26]{European Conference on Computer Systems}{April 27--30, 2026}",
        slot,
      ),
    ).toEqual({
      ok: false,
      reason:
        "the paper's TeX declares the 2026 edition (\\acmConference), not EuroSys 2025",
    });
  });

  test("a companion, extended-abstract, demo or preliminary track is rejected", () => {
    const own = { series: "CHI", year: 2026 };
    // Guards: the three shapes found in the corpus, each named by what the TeX says.
    expect(
      [
        "\\acmConference[SPLASH Companion '26]{Companion Proceedings of SPLASH}{October 2026}{Oakland}",
        "\\acmConference[CHI EA '26]{Extended Abstracts of the 2026 CHI Conference}{April 2026}{Barcelona}",
        "\\acmConference[PREPRINT]{ICSE'26 Companion. A preliminary version}{2026}{BoF}",
        "\\acmConference[Conference]{2026}{Under Review}{}",
        "\\acmBooktitle{Adjunct Proceedings of UIST '26}",
        "\\acmConference{Companion Proceedings of the Web Conference 2026}{2026}{Dubai}",
      ].map((t) => judgeDeclaredVenue(t, own)),
    ).toEqual(
      [
        "SPLASH Companion '26",
        "CHI EA '26",
        "PREPRINT",
        "Conference",
        "Adjunct Proceedings of UIST '26",
        "{Companion Proceedings of the Web Conference 2026}{2026}{Dubai}",
      ].map((what) => ({
        ok: false,
        reason: `the paper's TeX declares a track that is not the main proceedings: "${what}"`,
      })),
    );
  });
});

describe("what the TeX declares passes when it is the slot", () => {
  test("the slot's year, its own series' track, an acmYear, a comment or nothing pass", () => {
    // Guards: silent on a matching year; on a workshop slot whose own title says Workshop; on a
    // PACM acmYear (CSCW's 2024 volume of the 2025 edition); on a comment; on no declaration.
    const cases: readonly (readonly [string, Own])[] = [
      ["\\acmConference[EuroSys '25]{X}{2025}", slot],
      [
        "\\acmConference[CHI '25]{Proceedings of the 2025 CHI Conference}{April 2025}{Yokohama}",
        { series: "CHI", year: 2025 },
      ],
      [
        "\\acmConference[AgenticDev '26]{Proceedings of the 1st International Workshop on Agentic AI}{2026}{Munich}\n\\acmBooktitle{Proceedings of the 1st International Workshop on Agentic AI}",
        { series: "AgenticDev", year: 2026 },
      ],
      [
        "\\acmYear{2024}\n\\acmConference[CSCW 28]{CSCW 2025}{October 2025}{Bergen}",
        { series: "CSCW", year: 2025 },
      ],
      ["% \\acmConference[EuroSys '26]{X}{2026}", slot],
      ["\\documentclass{article}", slot],
      ["\\acmConference{Proceedings of EuroSys}{2025}{Rotterdam}", slot],
    ];
    expect(cases.map(([t, own]) => judgeDeclaredVenue(t, own))).toEqual([
      { ok: true },
      { ok: true },
      { ok: true },
      { ok: true },
      { ok: true },
      { ok: true },
      { ok: true },
    ]);
  });
});
