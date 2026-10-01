/** A paper's `talk` key and a preset's `talk` block, parsed. */
import { describe, expect, it } from "vitest";
import { DEFAULT_TALK_FILES, parsePaperTalk, venueTalkOf } from "./talk.ts";

describe("parsePaperTalk", () => {
  it("is null when the paper declares no talk", () => {
    expect(parsePaperTalk(undefined)).toEqual({ ok: true, value: null });
  });

  it("defaults the folder and the file names", () => {
    expect(parsePaperTalk({ mode: "remote-video" })).toEqual({
      ok: true,
      value: {
        mode: "remote-video",
        dir: "talk",
        files: DEFAULT_TALK_FILES,
        oneSlide: null,
      },
    });
  });

  it("takes a folder, file names and a one-slide size", () => {
    const r = parsePaperTalk({
      mode: "in-person",
      dir: "video",
      files: { video: "my-talk.mp4" },
      one_slide: { width_px: 1920, height_px: 1080 },
    });
    expect(r).toEqual({
      ok: true,
      value: {
        mode: "in-person",
        dir: "video",
        files: { ...DEFAULT_TALK_FILES, video: "my-talk.mp4" },
        oneSlide: { width: 1920, height: 1080 },
      },
    });
  });
});

describe("parsePaperTalk refuses", () => {
  it.each([
    ["not an object", "remote-video", '"talk" must be an object'],
    [
      "an unknown key",
      { mode: "remote-video", lenght: 1 },
      'unknown key "lenght"',
    ],
    ["an unknown mode", { mode: "zoom" }, '"talk.mode" must be one of'],
    ["an empty folder", { mode: "remote-video", dir: "" }, '"talk.dir"'],
    [
      "files not an object",
      { mode: "remote-video", files: [] },
      '"talk.files" must be an object',
    ],
    [
      "an unknown artifact",
      { mode: "remote-video", files: { slides: "s.pdf" } },
      '"talk.files": "slides"',
    ],
    [
      "a path for a name",
      { mode: "remote-video", files: { video: "a/b.mp4" } },
      '"talk.files": "video"',
    ],
    [
      "a size that is not integers",
      { mode: "remote-video", one_slide: { width_px: 1.5, height_px: 2 } },
      '"talk.one_slide"',
    ],
  ])("%s", (_, v, msg) => {
    const r = parsePaperTalk(v);
    expect(r.ok).toBe(false);
    expect(r.ok ? "" : r.error).toContain(msg);
  });
});

describe("venueTalkOf", () => {
  it("types every field, absent ones as null or empty", () => {
    expect(venueTalkOf({})).toEqual({
      modes: [],
      artifacts: new Map(),
      kinds: new Map(),
      video: {
        container: null,
        minHeightPx: null,
        maxBytes: null,
        captions: null,
      },
      oneSlide: null,
    });
  });

  it("reads modes, artifacts per mode, slots per kind, video limits and the one-slide size", () => {
    const t = venueTalkOf({
      modes: ["remote-video"],
      artifacts: { "remote-video": { required: ["video"] } },
      kinds: { short: { slot_s: 600, talk_s_max: 420 } },
      video: {
        container: "mp4",
        min_height_px: 720,
        max_bytes: 9,
        captions: "required",
      },
      one_slide: { width_px: 1920, height_px: 1080 },
    });
    expect(t.artifacts.get("remote-video")).toEqual({
      required: ["video"],
      optional: [],
    });
    expect(t.kinds.get("short")).toEqual({
      slotS: 600,
      talkSMin: null,
      talkSMax: 420,
      qaS: null,
    });
    expect(t.video).toEqual({
      container: "mp4",
      minHeightPx: 720,
      maxBytes: 9,
      captions: "required",
    });
    expect(t.oneSlide).toEqual({ width: 1920, height: 1080 });
  });
});
