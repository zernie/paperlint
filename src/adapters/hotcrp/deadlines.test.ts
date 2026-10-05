/**
 * The deadlines page parser on the pages five live HotCRP sites answered on 2026-10-05
 * (`cassette/deadlines-*.html`, recorded whole), and on a site that does not exist. Each expected
 * value was read off the page's text by hand before the parser existed.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseDeadlinesPage, whatOf } from "./index.ts";

type Site = "msr2027" | "aidc26" | "sosp26" | "icse2027" | "fse2027" | "nosuch";
const page = (site: Site): string =>
  readFileSync(
    new URL(`./cassette/deadlines-${site}.html`, import.meta.url),
    "utf8",
  );

const read = (site: Site, status = 200) => {
  const r = parseDeadlinesPage(status, page(site));
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.value;
};

describe("parseDeadlinesPage", () => {
  it("a conference with a resubmission deadline: the list carries it, the status object does not", () => {
    expect(read("msr2027")).toEqual({
      now: 1791194488.329003,
      open: true,
      blind: true,
      deadlines: [
        {
          what: "submission",
          label: "Submission deadline",
          at: "2026-10-20T04:00:00Z",
        },
        {
          what: "resubmission",
          label: "Resubmission deadline",
          at: "2026-10-23T04:00:00Z",
        },
      ],
    });
  });

  it("a workshop past its submission deadline, with a final-version deadline only the status object names", () => {
    expect(read("aidc26")).toEqual({
      now: 1791194489.473936,
      open: true,
      blind: true,
      deadlines: [
        {
          what: "submission",
          label: "Submission deadline",
          at: "2026-10-03T11:59:59Z",
        },
        {
          what: "camera-ready",
          label: "camera-ready",
          at: "2026-10-31T11:59:59Z",
        },
      ],
    });
  });
});

describe("parseDeadlinesPage — every kind at once", () => {
  it("registration, submission, a late resubmission and a final version: sorted by time", () => {
    expect(read("sosp26").deadlines).toEqual([
      {
        what: "registration",
        label: "Registration deadline",
        at: "2026-03-27T11:59:59Z",
      },
      {
        what: "submission",
        label: "Submission deadline",
        at: "2026-04-02T11:59:59Z",
      },
      {
        what: "resubmission",
        label: "Resubmission deadline",
        at: "2026-08-14T23:59:59Z",
      },
      {
        what: "camera-ready",
        label: "camera-ready",
        at: "2026-08-29T11:59:59Z",
      },
    ]);
  });
});

describe("parseDeadlinesPage — a closed round, AoE, and pages that are not deadlines", () => {
  it("a round that is not open: `open` is false and the dates still read", () => {
    const r = read("icse2027");
    expect(r.open).toBe(false);
    expect(r.deadlines.map((d) => [d.what, d.at])).toEqual([
      ["registration", "2026-06-24T11:59:59Z"],
      ["submission", "2026-07-09T11:59:00Z"],
    ]);
  });
});

describe("parseDeadlinesPage — AoE and non-pages", () => {
  it("the AoE a page prints is already an instant in UTC: «Oct 3, 11:59 PM AoE» is Oct 4, 11:59 UTC", () => {
    expect(read("fse2027").deadlines).toEqual([
      {
        what: "submission",
        label: "Submission deadline",
        at: "2026-10-04T11:59:00Z",
      },
    ]);
  });

  it("a site that does not exist: refused with the page's title", () => {
    expect(parseDeadlinesPage(404, page("nosuch"))).toEqual({
      ok: false,
      error: {
        kind: "refused",
        httpStatus: 404,
        messages: [
          { message: "No such conference", field: null, status: null },
        ],
      },
    });
  });

  it("a 200 page that is not a deadlines page, and a status object of another shape: malformed", () => {
    const detail: unknown = expect.stringContaining(
      "no `hotcrp.init_deadlines(…)` call",
    );
    expect(parseDeadlinesPage(200, "<html><body>hello</body></html>")).toEqual({
      ok: false,
      error: {
        kind: "malformed",
        httpStatus: 200,
        detail,
      },
    });
    const r = parseDeadlinesPage(200, 'hotcrp.init_deadlines({"sub":1})');
    expect(r.ok ? "parsed" : r.error.kind).toBe("malformed");
    const notJson = parseDeadlinesPage(200, "hotcrp.init_deadlines({now: 1})");
    expect(notJson.ok ? "parsed" : notJson.error.kind).toBe("malformed");
  });
});

describe("whatOf", () => {
  it("names the deadlines paperlint knows by their HotCRP labels, with or without a round name", () => {
    expect(whatOf("Submission deadline")).toBe("submission");
    expect(whatOf("Resubmission deadline")).toBe("resubmission");
    expect(whatOf("Short papers registration deadline")).toBe("registration");
    expect(whatOf("Final version deadline")).toBe("camera-ready");
    expect(whatOf("Response deadline")).toBeNull();
  });
});
