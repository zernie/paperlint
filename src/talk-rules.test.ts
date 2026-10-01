/**
 * The talk rules: the pure judges on typed values, and each rule run on a paper tree on disk with the
 * real media readers. `src/rule-cases.test.ts` runs every rule through the real CLI and ESLint; this
 * file covers the branches one case per rule cannot.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { nodeFiles, nodeListDir } from "./adapters/node/index.ts";
import { probeVideo } from "./adapters/mp4box/index.ts";
import { imageSize } from "./adapters/png/index.ts";
import { captions } from "./adapters/srt/index.ts";
import { presetsDir } from "./package-dirs.ts";
import { venueTalkOf, type VideoProbe } from "./domain/talk.ts";
import {
  clock,
  DEFAULT_COVER,
  judgeCover,
  judgeDuration,
  judgeVideoFormat,
  requiredArtifacts,
  talkRules,
  type TalkRuleName,
} from "./talk-rules.ts";
import { useTempDir, writeTree } from "../test/support.ts";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const media = (name: string): Uint8Array =>
  readFileSync(join(ROOT, "fixtures", "talk", name));

const DEPS = {
  files: nodeFiles,
  venuesDir: presetsDir(),
  media: { probeVideo, imageSize, captions },
  listDir: nodeListDir,
};

const VENUE = {
  modes: ["remote-video"],
  artifacts: { "remote-video": { required: ["video"] } },
  kinds: { short: { slot_s: 10, talk_s_min: 2, talk_s_max: 4 } },
  video: { container: "mp4", min_height_px: 720, captions: "required" },
};

interface Report {
  readonly messageId: string;
  readonly data: Readonly<Record<string, string | number>> | undefined;
}

/** Rule `name` on a paper tree: the preset's talk block, the paper's settings, its files. */
function run(
  name: TalkRuleName,
  o: {
    readonly venue?: Record<string, unknown> | null;
    readonly settings?: Record<string, unknown>;
    readonly files?: Record<string, string | Uint8Array>;
    readonly options?: readonly unknown[];
    readonly cwd?: string;
  } = {},
): readonly Report[] {
  const dir = useTempDir("paperlint-talk-rules-");
  const venue =
    o.venue === null
      ? { extends: "paperlint:acm-sigconf" }
      : { extends: "paperlint:agenticdev", talk: { ...VENUE, ...o.venue } };
  writeTree(dir, {
    "package.json": "{}",
    "p/paper.tex": "x",
    "p/venue.jsonc": JSON.stringify(venue),
    "p/paperlint.json": JSON.stringify(
      o.settings ?? {
        extends: "./venue.jsonc",
        kind: "short",
        talk: { mode: "remote-video" },
      },
    ),
    "p/talk/talk.mp4": media("talk.mp4"),
    "p/talk/talk.srt": media("talk.srt"),
    ...o.files,
  });
  const reports: Report[] = [];
  const visitor = talkRules(DEPS)[name].create({
    filename: join(dir, "p", "paper.tex"),
    ...(o.cwd === undefined ? {} : { cwd: o.cwd }),
    sourceCode: { text: "x" },
    options: o.options ?? [],
    report: (d) => reports.push({ messageId: d.messageId, data: d.data }),
  });
  visitor.root?.();
  return reports;
}
const ids = (r: readonly Report[]) => r.map((x) => x.messageId);
const declared = (talk: Record<string, unknown>, extra = {}) => ({
  extends: "./venue.jsonc",
  kind: "short",
  talk,
  ...extra,
});

describe("clock", () => {
  it("prints minutes, seconds to a tenth, and the exact seconds", () => {
    expect(clock(320.84)).toBe("5:20.8 (320.84 s)");
    expect(clock(359.97)).toBe("6:00.0 (359.97 s)");
    expect(clock(3)).toBe("0:03.0 (3 s)");
  });
});

describe("talk/profile", () => {
  it("is silent for the conforming tree, and on a file that is not paper.tex", () => {
    expect(run("profile")).toEqual([]);
    const v = talkRules(DEPS).profile.create({
      filename: "/x/notes.tex",
      sourceCode: { text: "" },
      options: [],
      report: () => undefined,
    });
    expect(v).toEqual({});
  });

  it("names a missing preset, a preset without a talk block, a missing kind and a kind with no slot", () => {
    expect(
      ids(run("profile", { settings: { talk: { mode: "remote-video" } } })),
    ).toEqual(["noPreset"]);
    expect(ids(run("profile", { venue: null }))).toEqual(["noTalkBlock"]);
    expect(
      ids(
        run("profile", {
          settings: {
            extends: "./venue.jsonc",
            talk: { mode: "remote-video" },
          },
        }),
      ),
    ).toEqual(["kindMissing"]);
    expect(
      ids(
        run("profile", {
          settings: declared({ mode: "remote-video" }, { kind: "full" }),
        }),
      ),
    ).toEqual(["kindNoSlot"]);
  });

  it("accepts any mode when the venue lists none", () => {
    expect(
      run("profile", {
        venue: { modes: undefined },
        settings: declared({ mode: "in-person" }),
      }),
    ).toEqual([]);
  });

  it("is silent when the settings do not parse — pdf/profile says why", () => {
    expect(run("profile", { settings: { talk: { mode: "zoom" } } })).toEqual(
      [],
    );
  });
});

describe("talk/required-files and talk/undeclared", () => {
  it("adds the captions when the venue requires them with the video", () => {
    const vt = venueTalkOf({
      artifacts: { "remote-video": { required: ["video"] } },
      video: { captions: "required" },
    });
    expect(requiredArtifacts(vt, "remote-video")).toEqual([
      "video",
      "captions",
    ]);
    expect(requiredArtifacts(vt, "in-person")).toEqual([]);
  });

  it("names each missing file, under the name the paper gives it", () => {
    const r = run("required-files", {
      settings: declared({
        mode: "remote-video",
        files: { video: "mine.mp4" },
      }),
    });
    expect(ids(r)).toEqual(["missing"]);
    expect(r[0]?.data?.["artifact"]).toBe("video");
    expect(String(r[0]?.data?.["file"])).toMatch(/p\/talk\/mine\.mp4$/);
    expect(run("required-files", { venue: null })).toEqual([]);
  });

  it("warns about a video in talk/ when no talk is declared, and only then", () => {
    const r = run("undeclared", {
      settings: { extends: "./venue.jsonc", kind: "short" },
      cwd: "/",
    });
    expect(ids(r)).toEqual(["undeclared"]);
    // Shown relative to cwd "/": no leading slash. The temp root differs by OS
    // (/tmp on Linux, /private/var/folders on macOS), so only the tail is fixed.
    const shown = String(r[0]?.data?.["file"]);
    expect(shown).not.toMatch(/^\//);
    expect(shown).toMatch(/p\/talk\/talk\.mp4$/);
    expect(run("undeclared")).toEqual([]);
    expect(
      run("duration", {
        settings: { extends: "./venue.jsonc", kind: "short" },
      }),
    ).toEqual([]);
  });
});

const probe = (p: Partial<VideoProbe> = {}): VideoProbe => ({
  durationS: 3,
  audioS: 3,
  heightPx: 720,
  widthPx: 1280,
  brands: ["isom"],
  ...p,
});
const slot = {
  venue: "v",
  kind: "short",
  slot: { slotS: 10, talkSMin: 2, talkSMax: 4, qaS: null },
};
const at = { file: "t.mp4", tolS: 1 };

describe("talk/duration and talk/duration-floor", () => {
  it("reports a video over the slot, and an audio track more than the tolerance away", () => {
    expect(
      ids(judgeDuration(probe({ durationS: 5, audioS: 5 }), slot, at)),
    ).toEqual(["tooLong"]);
    expect(ids(judgeDuration(probe({ audioS: 1.5 }), slot, at))).toEqual([
      "trackMismatch",
    ]);
    expect(
      judgeDuration(probe({ audioS: null, durationS: 9 }), null, at),
    ).toEqual([]);
  });

  it("reads the tolerance option, and the real short-audio fixture", () => {
    expect(
      ids(
        run("duration", {
          files: { "p/talk/talk.mp4": media("short-audio.mp4") },
        }),
      ),
    ).toEqual(["trackMismatch"]);
    expect(
      run("duration", {
        files: { "p/talk/talk.mp4": media("short-audio.mp4") },
        options: [{ trackToleranceS: 3 }],
      }),
    ).toEqual([]);
    expect(
      run("duration", { files: { "p/talk/talk.mp4": "not a video" } }),
    ).toEqual([]);
  });

  it("warns under the floor; silent without a floor or a video", () => {
    expect(
      ids(
        run("duration-floor", {
          venue: {
            kinds: { short: { slot_s: 9, talk_s_min: 5, talk_s_max: 9 } },
          },
        }),
      ),
    ).toEqual(["tooShort"]);
    expect(
      run("duration-floor", {
        venue: { kinds: { short: { slot_s: 9, talk_s_max: 9 } } },
      }),
    ).toEqual([]);
    expect(
      run("duration-floor", {
        settings: declared({
          mode: "remote-video",
          files: { video: "none.mp4" },
        }),
      }),
    ).toEqual([]);
    expect(
      run("duration-floor", {
        settings: declared({ mode: "remote-video" }, { kind: null }),
      }),
    ).toEqual([]);
  });
});

describe("talk/video-format", () => {
  const limits = {
    container: "mp4" as const,
    minHeightPx: 720,
    maxBytes: 100,
    captions: null,
  };
  it("reports QuickTime, a missing video track, a short picture and a large file", () => {
    expect(
      ids(judgeVideoFormat(probe({ brands: ["qt  "] }), 1, limits)),
    ).toEqual(["container"]);
    expect(ids(judgeVideoFormat(probe({ heightPx: null }), 1, limits))).toEqual(
      ["noVideoTrack"],
    );
    expect(ids(judgeVideoFormat(probe({ heightPx: 480 }), 1, limits))).toEqual([
      "height",
    ]);
    expect(ids(judgeVideoFormat(probe(), 101, limits))).toEqual(["bytes"]);
    expect(
      judgeVideoFormat(probe({ heightPx: 1 }), 1e9, {
        container: null,
        minHeightPx: null,
        maxBytes: null,
        captions: null,
      }),
    ).toEqual([]);
  });

  it("reports a file that is not ISO media; silent without a video or a talk block", () => {
    expect(
      ids(run("video-format", { files: { "p/talk/talk.mp4": "not a video" } })),
    ).toEqual(["unreadable"]);
    expect(
      ids(
        run("video-format", {
          files: { "p/talk/talk.mp4": media("talk.mov") },
        }),
      ),
    ).toEqual(["container"]);
    expect(
      run("video-format", {
        settings: declared({
          mode: "remote-video",
          files: { video: "none.mp4" },
        }),
      }),
    ).toEqual([]);
    expect(run("video-format", { venue: null })).toEqual([]);
  });
});

describe("talk/one-slide-size", () => {
  const png = { "p/talk/one-slide.png": media("one-slide.png") };
  it("holds the image to the paper's size over the venue's", () => {
    expect(
      run("one-slide-size", {
        files: png,
        venue: { one_slide: { width_px: 16, height_px: 9 } },
      }),
    ).toEqual([]);
    expect(
      ids(
        run("one-slide-size", {
          files: png,
          venue: { one_slide: { width_px: 1920, height_px: 1080 } },
        }),
      ),
    ).toEqual(["size"]);
    expect(
      run("one-slide-size", {
        files: png,
        settings: declared({
          mode: "remote-video",
          one_slide: { width_px: 16, height_px: 9 },
        }),
        venue: { one_slide: { width_px: 1, height_px: 1 } },
      }),
    ).toEqual([]);
  });

  it("reports a file that is not a PNG; silent with no size declared or no file", () => {
    expect(
      ids(
        run("one-slide-size", {
          files: { "p/talk/one-slide.png": "x" },
          venue: { one_slide: { width_px: 1, height_px: 1 } },
        }),
      ),
    ).toEqual(["notPng"]);
    expect(run("one-slide-size", { files: png })).toEqual([]);
    expect(
      run("one-slide-size", {
        venue: { one_slide: { width_px: 1, height_px: 1 } },
      }),
    ).toEqual([]);
  });
});

describe("talk/captions-cover", () => {
  const cue = (startS: number, endS: number) => ({ startS, endS });
  it("reports no cues, a late start, an early end and a long gap", () => {
    expect(ids(judgeCover([], 10, DEFAULT_COVER))).toEqual(["noCues"]);
    expect(ids(judgeCover([cue(2, 10)], 10, DEFAULT_COVER))).toEqual([
      "lateStart",
    ]);
    expect(ids(judgeCover([cue(0, 7)], 10, DEFAULT_COVER))).toEqual([
      "earlyEnd",
    ]);
    expect(ids(judgeCover([cue(7, 10), cue(0, 1)], 10, DEFAULT_COVER))).toEqual(
      ["gap"],
    );
    expect(judgeCover([cue(0, 4), cue(5, 9)], 10, DEFAULT_COVER)).toEqual([]);
  });

  it("reads its thresholds from the options; silent without captions or a video", () => {
    const late = { "p/talk/talk.srt": "1\n00:00:02,000 --> 00:00:02,900\nx\n" };
    expect(ids(run("captions-cover", { files: late }))).toEqual(["lateStart"]);
    expect(
      run("captions-cover", { files: late, options: [{ maxStartS: 3 }] }),
    ).toEqual([]);
    expect(
      run("captions-cover", {
        settings: declared({
          mode: "remote-video",
          files: { captions: "none.srt" },
        }),
      }),
    ).toEqual([]);
    expect(
      run("captions-cover", { files: { "p/talk/talk.mp4": "x" } }),
    ).toEqual([]);
  });
});

describe("without a preset or a talk block, only talk/profile speaks", () => {
  const noPreset = { talk: { mode: "remote-video" }, kind: "short" };
  it.each([
    "required-files",
    "duration",
    "duration-floor",
    "video-format",
  ] as const)("%s is silent", (name) => {
    expect(run(name, { settings: noPreset })).toEqual([]);
    expect(run(name, { venue: null })).toEqual([]);
  });

  it("a duration mismatch is still reported without a slot", () => {
    const short = { "p/talk/talk.mp4": media("short-audio.mp4") };
    expect(ids(run("duration", { settings: noPreset, files: short }))).toEqual([
      "trackMismatch",
    ]);
  });

  it("a kind the venue sets no slot for: no floor, and profile lists the kinds or (none)", () => {
    const full = declared({ mode: "remote-video" }, { kind: "full" });
    expect(run("duration-floor", { settings: full })).toEqual([]);
    const r = run("profile", { venue: { kinds: {} } });
    expect(r[0]?.data?.["known"]).toBe("(none)");
  });
});

describe("largest gap, in time order", () => {
  const cue = (startS: number, endS: number) => ({ startS, endS });
  it("keeps the longest of several gaps, and an overlap leaves none", () => {
    const r = judgeCover(
      [cue(0, 1), cue(7, 8), cue(8.5, 9.5)],
      10,
      DEFAULT_COVER,
    );
    expect(r.map((f) => [f.messageId, f.data["s"]])).toEqual([["gap", "6.0"]]);
    expect(
      judgeCover([cue(0, 9), cue(1, 2), cue(8.5, 9.9)], 10, DEFAULT_COVER),
    ).toEqual([]);
  });
});
