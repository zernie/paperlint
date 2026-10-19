/** A preset's portal readings against the page: kept, rewritten, added, noted — a call's never touched. */
import { describe, expect, test } from "vitest";
import { refreshReadings } from "./deadline-refresh.ts";

const reading = (
  what: "submission" | "resubmission" | "camera-ready",
  at: string,
  source: "portal" | "call" = "portal",
) => ({
  what,
  at,
  source,
  url: "https://x.example/deadlines",
  read: "2026-10-01",
});
const page = (
  deadlines: readonly {
    what: "submission" | "camera-ready" | null;
    at: string;
  }[],
) => ({
  now: 1,
  open: true,
  blind: true,
  deadlines: deadlines.map((d) => ({ ...d, label: String(d.what) })),
});

describe("refreshReadings — what the page says, over what the preset said", () => {
  test("a reading the portal no longer lists is kept and noted; a call's reading is never touched", () => {
    const r = refreshReadings(
      [
        reading("submission", "2026-10-21T11:59:59Z"),
        reading("submission", "2026-10-21T11:59:59Z", "call"),
        reading("camera-ready", "2026-12-01T00:00:00Z"),
      ],
      page([{ what: "submission", at: "2026-10-21T11:59:59Z" }]),
      "https://x.example/deadlines",
      "2026-10-06",
    );
    expect(r.changes).toEqual([]);
    expect(r.notes).toEqual([
      "camera-ready: no longer on the page — kept as read 2026-10-01",
    ]);
    expect(r.readings).toEqual([
      reading("submission", "2026-10-21T11:59:59Z"),
      reading("submission", "2026-10-21T11:59:59Z", "call"),
      reading("camera-ready", "2026-12-01T00:00:00Z"),
    ]);
  });

  test("a kind the page lists twice binds at the earlier instant; a label paperlint names no kind for is left out", () => {
    const r = refreshReadings(
      [],
      page([
        { what: "submission", at: "2026-10-22T04:00:00Z" },
        { what: "submission", at: "2026-10-21T11:59:59Z" },
        { what: null, at: "2026-09-01T00:00:00Z" },
      ]),
      "https://x.example/deadlines",
      "2026-10-06",
    );
    expect(r.readings).toEqual([
      {
        what: "submission",
        at: "2026-10-21T11:59:59Z",
        source: "portal",
        url: "https://x.example/deadlines",
        read: "2026-10-06",
      },
    ]);
    expect(r.notes).toEqual([
      "submission: the page lists 2026-10-21T11:59:59Z, 2026-10-22T04:00:00Z — the earliest is recorded",
    ]);
  });
});
