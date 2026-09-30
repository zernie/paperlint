/**
 * THE TALK RULES — a paper's finished talk files judged against what its venue asks a presenter to
 * send. paperlint does not make the talk and does not know how it was made; it reads the files.
 *
 *   talk/profile          error  the paper's `talk` can be judged: a venue preset with a `talk`
 *                                block, a mode it allows, a slot for the paper's kind
 *   talk/required-files   error  every file the venue requires for the paper's mode is in the folder
 *   talk/undeclared       warn   a video sits in the paper's `talk/` folder, and no `talk` is declared
 *   talk/duration         error  the video is no longer than the slot's talk; its audio track runs as
 *                                long as the container
 *   talk/duration-floor   warn   the video is no shorter than the talk the venue asks for
 *   talk/video-format     error  the video is an MP4, tall enough, small enough
 *   talk/one-slide-size   error  the one-slide image has the declared size
 *   talk/captions-cover   warn   the captions cover the video: start near its start, end near its end,
 *                                no long gap
 *
 * ── WHAT THEY READ ───────────────────────────────────────────────────────────────
 * Like the venue rules, they run on a paper's `paper.tex` and judge the files beside it: the paper's
 * `paperlint.json` (`talk`, `kind`, `extends`), the preset it resolves to (`talk` block), and the
 * files in the talk folder, read through the `TalkMedia` port — MP4Box.js for the video, the PNG
 * header for the image, an SRT parser for the captions. No ffmpeg, no build step, no facts file.
 *
 * ── WHO SPEAKS WHEN THE INPUT CANNOT BE JUDGED ───────────────────────────────────
 *   no `talk` declared           every rule silent but talk/undeclared
 *   settings or preset broken    every talk rule silent — pdf/profile says why
 *   talk, but nothing to judge by talk/profile; the rules that need the missing part are silent
 *   a file missing               talk/required-files; the rules reading that file are silent
 *   a video that does not parse  talk/video-format; duration and captions silent
 */
import { basename, dirname, join, relative } from "node:path";
import { callerPath } from "./caller-path.ts";
import { CONFIG_FILE } from "#lib/paper-config";
import { paperPreset } from "./presets.ts";
import { fieldOf } from "./domain/record.ts";
import type { Files } from "./ports/files.ts";
import type { ListDir, TalkMedia } from "./ports/talk-media.ts";
import {
  DEFAULT_TALK_DIR,
  type Cue,
  type PaperTalk,
  type PixelSize,
  type TalkArtifact,
  type TalkSlot,
  type VenueTalk,
  type VideoProbe,
} from "./domain/talk.ts";
import { rulePageUrl, type VenueRuleModule } from "./venue-rules.ts";

// ── what one lint run knows about a paper's talk ─────────────────────────────────────

/** What the rules are built with. */
export interface TalkRuleDeps {
  readonly files: Files;
  /** The package's presets directory: the shipped presets and their schema. */
  readonly venuesDir: string;
  readonly media: TalkMedia;
  readonly listDir: ListDir;
}

/** A paper that declares a talk, with what its venue says about talks (or null). */
interface Declared {
  readonly kind: "declared";
  readonly paperDir: string;
  readonly talk: PaperTalk;
  readonly paperKind: string | null;
  /** The preset's label; null when the paper names no preset. */
  readonly venue: string | null;
  readonly venueTalk: VenueTalk | null;
}

type Assessment =
  /** No `talk` in the paper's settings; the paths of stray videos in the default folder. */
  | { readonly kind: "undeclared"; readonly strays: readonly string[] }
  /** Settings or preset broken — `pdf/profile` reports it. */
  | { readonly kind: "unreadable" }
  | Declared;

/** The `.mp4` files in the paper's default talk folder. */
const straysOf = (paperDir: string, deps: TalkRuleDeps): readonly string[] =>
  deps
    .listDir(callerPath(join(paperDir, DEFAULT_TALK_DIR)))
    .filter((n) => n.toLowerCase().endsWith(".mp4"))
    .map((n) => join(paperDir, DEFAULT_TALK_DIR, n));

/** One paper, assessed. Reads through `deps` only; never throws on a paper's files. */
function assess(paperDir: string, deps: TalkRuleDeps): Assessment {
  const p = paperPreset(paperDir, deps);
  if (p.kind === "settings-problem" || p.kind === "preset-problem")
    return { kind: "unreadable" };
  const talk = p.settings?.talk ?? null;
  if (talk === null)
    return { kind: "undeclared", strays: straysOf(paperDir, deps) };
  const resolved = p.kind === "resolved" ? p.preset : null;
  return {
    kind: "declared",
    paperDir,
    talk,
    paperKind: p.settings?.kind ?? null,
    venue: resolved?.label ?? null,
    venueTalk: resolved?.talk ?? null,
  };
}

// ── the verdict's vocabulary ─────────────────────────────────────────────────────────

interface Finding {
  readonly messageId: string;
  readonly data: Readonly<Record<string, string | number>>;
}
const finding = (
  messageId: string,
  data: Readonly<Record<string, string | number>> = {},
): Finding => ({ messageId, data });

/** Seconds as `m:ss.s (N s)`: what a person reads off a player, and the exact number. */
export function clock(s: number): string {
  const tenths = Math.round(s * 10) / 10;
  const m = Math.floor(tenths / 60);
  const rest = (tenths - m * 60).toFixed(1).padStart(4, "0");
  return `${String(m)}:${rest} (${String(Math.round(s * 100) / 100)} s)`;
}

/** Where artifact `a` is looked for. */
const fileOf = (d: Declared, a: TalkArtifact): string =>
  join(d.paperDir, d.talk.dir, d.talk.files[a]);

const bytesOf = (deps: TalkRuleDeps, path: string): Uint8Array | null =>
  deps.files.readBytes(callerPath(path));

/** The slot of the paper's kind, when the venue sets one. */
const slotOf = (d: Declared): TalkSlot | null =>
  d.paperKind === null
    ? null
    : (d.venueTalk?.kinds.get(d.paperKind) ?? null);

/** The video's probe; null when the file is absent or does not parse (other rules say which). */
function videoOf(d: Declared, deps: TalkRuleDeps): VideoProbe | null {
  const bytes = bytesOf(deps, fileOf(d, "video"));
  return bytes === null ? null : deps.media.probeVideo(bytes);
}

// ── the judges ───────────────────────────────────────────────────────────────────────

interface JudgeContext {
  readonly deps: TalkRuleDeps;
  readonly options: readonly unknown[];
  readonly shown: (path: string) => string;
}
type Judge = (d: Declared, ctx: JudgeContext) => readonly Finding[];

/** What keeps the declaration from being judged, most basic first. */
export function judgeProfile(d: Declared): readonly Finding[] {
  const venue = d.venue;
  if (venue === null) return [finding("noPreset")];
  const vt = d.venueTalk;
  if (vt === null) return [finding("noTalkBlock", { venue })];
  const mode = d.talk.mode;
  const modes = vt.modes.join(", ");
  const modeProblem =
    vt.modes.length > 0 && !vt.modes.includes(mode)
      ? [finding("mode", { venue, mode, modes })]
      : [];
  const known = [...vt.kinds.keys()].join(", ") || "(none)";
  const kind = d.paperKind;
  const kindProblem =
    kind === null
      ? [finding("kindMissing", { venue, known })]
      : vt.kinds.has(kind)
        ? []
        : [finding("kindNoSlot", { venue, kind, known })];
  return [...modeProblem, ...kindProblem];
}

/** The artifacts the paper's mode owes at its venue, captions included when the venue requires them. */
export function requiredArtifacts(
  vt: VenueTalk,
  mode: PaperTalk["mode"],
): readonly TalkArtifact[] {
  const owed = vt.artifacts.get(mode)?.required ?? [];
  const captions: readonly TalkArtifact[] =
    vt.video.captions === "required" && owed.includes("video")
      ? ["captions"]
      : [];
  return [...new Set([...owed, ...captions])];
}

const judgeRequired: Judge = (d, { deps, shown }) =>
  d.venueTalk === null
    ? []
    : requiredArtifacts(d.venueTalk, d.talk.mode)
        .filter((a) => !deps.files.isFile(callerPath(fileOf(d, a))))
        .map((a) =>
          finding("missing", {
            artifact: a,
            file: shown(fileOf(d, a)),
            venue: d.venue ?? "",
            mode: d.talk.mode,
          }),
        );

/** Seconds a track may differ from the container before it is reported. */
export const DEFAULT_TRACK_TOLERANCE_S = 1;

const numberOption = (options: unknown, key: string, dflt: number): number => {
  const v = fieldOf(options, key);
  return typeof v === "number" ? v : dflt;
};

/** Over the slot's ceiling, and an audio track that ends away from the container's end. */
export function judgeDuration(
  v: VideoProbe,
  slot: TalkSlot | null,
  at: { readonly file: string; readonly tolS: number; readonly venue: string },
): readonly Finding[] {
  const over =
    slot !== null && v.durationS > slot.talkSMax
      ? [
          finding("tooLong", {
            file: at.file,
            got: clock(v.durationS),
            max: clock(slot.talkSMax),
            venue: at.venue,
          }),
        ]
      : [];
  const off = v.audioS === null ? 0 : Math.abs(v.durationS - v.audioS);
  const mismatch =
    v.audioS !== null && off > at.tolS
      ? [
          finding("trackMismatch", {
            file: at.file,
            video: clock(v.durationS),
            audio: clock(v.audioS),
            tol: at.tolS,
          }),
        ]
      : [];
  return [...over, ...mismatch];
}

const judgeDurationRule: Judge = (d, { deps, options, shown }) => {
  const v = videoOf(d, deps);
  return v === null
    ? []
    : judgeDuration(v, slotOf(d), {
        file: shown(fileOf(d, "video")),
        tolS: numberOption(
          options[0],
          "trackToleranceS",
          DEFAULT_TRACK_TOLERANCE_S,
        ),
        venue: d.venue ?? "",
      });
};

const judgeFloor: Judge = (d, { deps, shown }) => {
  const v = videoOf(d, deps);
  const min = slotOf(d)?.talkSMin ?? null;
  return v === null || min === null || v.durationS >= min
    ? []
    : [
        finding("tooShort", {
          file: shown(fileOf(d, "video")),
          got: clock(v.durationS),
          min: clock(min),
          venue: d.venue ?? "",
          kind: d.paperKind ?? "",
        }),
      ];
};

/** The video's container, height and size against the venue's limits. */
export function judgeVideoFormat(
  v: VideoProbe,
  bytes: number,
  limits: VenueTalk["video"],
): readonly Finding[] {
  const qt = v.brands[0] === "qt  ";
  const container =
    limits.container === "mp4" && qt ? [finding("container", {})] : [];
  const min = limits.minHeightPx;
  const height =
    min === null
      ? []
      : v.heightPx === null
        ? [finding("noVideoTrack", {})]
        : v.heightPx < min
          ? [finding("height", { got: v.heightPx, min })]
          : [];
  const max = limits.maxBytes;
  const size =
    max !== null && bytes > max ? [finding("bytes", { got: bytes, max })] : [];
  return [...container, ...height, ...size];
}

const judgeFormat: Judge = (d, { deps, shown }) => {
  const bytes = bytesOf(deps, fileOf(d, "video"));
  if (bytes === null || d.venueTalk === null) return [];
  const v = deps.media.probeVideo(bytes);
  const file = shown(fileOf(d, "video"));
  const venue = d.venue ?? "";
  return v === null
    ? [finding("unreadable", { file })]
    : judgeVideoFormat(v, bytes.length, d.venueTalk.video).map((f) =>
        finding(f.messageId, { ...f.data, file, venue }),
      );
};

/** The size to hold the one-slide to: the paper's own, else the venue's; null when neither says. */
const oneSlideSizeOf = (d: Declared): PixelSize | null =>
  d.talk.oneSlide ?? d.venueTalk?.oneSlide ?? null;

const judgeOneSlide: Judge = (d, { deps, shown }) => {
  const want = oneSlideSizeOf(d);
  const bytes = bytesOf(deps, fileOf(d, "one-slide"));
  if (want === null || bytes === null) return [];
  const got = deps.media.imageSize(bytes);
  const file = shown(fileOf(d, "one-slide"));
  const size = (s: PixelSize) => `${String(s.width)}×${String(s.height)}`;
  return got === null
    ? [finding("notPng", { file })]
    : got.width === want.width && got.height === want.height
      ? []
      : [finding("size", { file, got: size(got), want: size(want) })];
};

/** The thresholds of `talk/captions-cover`, in seconds. Uncalibrated: one real talk measured. */
export interface CoverLimits {
  readonly maxStartS: number;
  readonly maxEndGapS: number;
  readonly maxGapS: number;
}
export const DEFAULT_COVER: CoverLimits = {
  maxStartS: 1,
  maxEndGapS: 2,
  maxGapS: 5,
};

/** The longest silence between consecutive cues, and where it starts. */
function largestGap(
  cues: readonly Cue[],
): { readonly at: number; readonly s: number } | null {
  const sorted = [...cues].sort((a, b) => a.startS - b.startS);
  return sorted.slice(1).reduce<{ at: number; s: number } | null>(
    (best, cue, i) => {
      const prevEnd = sorted[i]?.endS ?? cue.startS;
      const s = cue.startS - prevEnd;
      return best === null || s > best.s ? { at: prevEnd, s } : best;
    },
    null,
  );
}

/** How the cues cover a video of `durationS`. */
export function judgeCover(
  cues: readonly Cue[],
  durationS: number,
  limits: CoverLimits,
): readonly Finding[] {
  if (cues.length === 0) return [finding("noCues", {})];
  const first = Math.min(...cues.map((c) => c.startS));
  const last = Math.max(...cues.map((c) => c.endS));
  const gap = largestGap(cues);
  return [
    ...(first > limits.maxStartS
      ? [finding("lateStart", { first: clock(first), max: limits.maxStartS })]
      : []),
    ...(last < durationS - limits.maxEndGapS
      ? [
          finding("earlyEnd", {
            last: clock(last),
            video: clock(durationS),
            max: limits.maxEndGapS,
          }),
        ]
      : []),
    ...(gap !== null && gap.s > limits.maxGapS
      ? [finding("gap", { at: clock(gap.at), s: gap.s.toFixed(1), max: limits.maxGapS })]
      : []),
  ];
}

const coverLimitsOf = (options: unknown): CoverLimits => ({
  maxStartS: numberOption(options, "maxStartS", DEFAULT_COVER.maxStartS),
  maxEndGapS: numberOption(options, "maxEndGapS", DEFAULT_COVER.maxEndGapS),
  maxGapS: numberOption(options, "maxGapS", DEFAULT_COVER.maxGapS),
});

const judgeCaptions: Judge = (d, { deps, options, shown }) => {
  const text = bytesOf(deps, fileOf(d, "captions"));
  const v = videoOf(d, deps);
  if (text === null || v === null) return [];
  const cues = deps.media.captions(new TextDecoder().decode(text));
  const file = shown(fileOf(d, "captions"));
  return judgeCover(cues, v.durationS, coverLimitsOf(options[0])).map((f) =>
    finding(f.messageId, { ...f.data, file }),
  );
};

// ── the ESLint rules ─────────────────────────────────────────────────────────────────

export type TalkRuleName =
  | "profile"
  | "required-files"
  | "undeclared"
  | "duration"
  | "duration-floor"
  | "video-format"
  | "one-slide-size"
  | "captions-cover";

/** Which rule reports what, given a paper that declares a talk. `undeclared` is judged apart. */
const JUDGES: Readonly<Record<Exclude<TalkRuleName, "undeclared">, Judge>> = {
  profile: (d) => judgeProfile(d),
  "required-files": judgeRequired,
  duration: judgeDurationRule,
  "duration-floor": judgeFloor,
  "video-format": judgeFormat,
  "one-slide-size": judgeOneSlide,
  "captions-cover": judgeCaptions,
};

function findingsOf(
  name: TalkRuleName,
  a: Assessment,
  ctx: JudgeContext,
): readonly Finding[] {
  if (name === "undeclared")
    return a.kind === "undeclared"
      ? a.strays.map((f) =>
          finding("undeclared", { file: ctx.shown(f), config: CONFIG_FILE }),
        )
      : [];
  return a.kind === "declared" ? JUDGES[name](a, ctx) : [];
}

const TALK = "`talk` in the paper's paperlint.json";

type Meta = Pick<VenueRuleModule["meta"], "messages"> & {
  readonly type?: "suggestion";
  readonly description: string;
  readonly schema?: readonly object[];
};

const META: Readonly<Record<TalkRuleName, Meta>> = {
  profile: {
    description:
      "a paper's `talk` can be judged: its venue preset has a `talk` block, allows the paper's mode, and sets a slot for its kind",
    messages: {
      noPreset: `the paper declares ${TALK} and names no venue preset ("extends"), so nothing says what the talk must be`,
      noTalkBlock:
        "the paper declares a talk, and the preset `{{venue}}` has no `talk` block — so its files are not judged. Add one to your own preset, quoting the organizers",
      mode: "`{{venue}}` allows the talk modes {{modes}}; this paper declares `{{mode}}`",
      kindMissing: `${CONFIG_FILE} names no \`kind\`, so the talk slot of \`{{venue}}\` is not known; its talk kinds: {{known}}`,
      kindNoSlot:
        "`{{venue}}` sets no talk slot for a `{{kind}}` paper, so the video's length is not checked; its talk kinds: {{known}}",
    },
  },
  "required-files": {
    description:
      "every file the venue requires for the paper's talk mode is in the talk folder",
    messages: {
      missing:
        "{{venue}} asks for the {{artifact}} of a {{mode}} talk, and {{file}} is not there — add it, or name the file in `talk.files`",
    },
  },
  undeclared: {
    type: "suggestion",
    description:
      "a video in the paper's talk folder while the paper declares no `talk`, so nothing checks it",
    messages: {
      undeclared:
        '{{file}} is a talk video, and this paper declares no `talk`, so its length and format are not checked — declare it in {{config}}: "talk": { "mode": "remote-video" }',
    },
  },
  duration: {
    description:
      "the talk video is no longer than the slot's talk, and its audio track runs as long as the video",
    schema: [
      {
        type: "object",
        properties: { trackToleranceS: { type: "number", minimum: 0 } },
        additionalProperties: false,
      },
    ],
    messages: {
      tooLong:
        "{{file}} runs {{got}}, over the {{max}} talk {{venue}} sets for this kind of paper — cut it",
      trackMismatch:
        "{{file}}: the video runs {{video}} and its audio track {{audio}}, more than {{tol}} s apart — a cut or a re-encode dropped or padded sound",
    },
  },
  "duration-floor": {
    type: "suggestion",
    description:
      "the talk video is no shorter than the talk the venue asks for",
    messages: {
      tooShort:
        "{{file}} runs {{got}}, under the {{min}} talk {{venue}} asks for a {{kind}} paper — decide whether that is fine, or set this rule to off for the paper",
    },
  },
  "video-format": {
    description:
      "the talk video is an MP4 file, at least the venue's height, and within its size limit",
    messages: {
      unreadable:
        "{{file}} is not an MP4 or QuickTime file (no `ftyp`/`moov` box), so its length and format cannot be read — export it as MP4 (H.264)",
      container:
        "{{file}} is a QuickTime (.mov) file inside, and {{venue}} asks for MP4 — re-export as MP4",
      noVideoTrack: "{{file}} has no video track",
      height:
        "{{file}} is {{got}} px high, under the {{min}} px {{venue}} asks for — export at a higher resolution",
      bytes:
        "{{file}} is {{got}} bytes, over the {{max}} {{venue}} accepts — re-encode at a lower bitrate",
    },
  },
  "one-slide-size": {
    description:
      "the one-slide image is a PNG of the size the venue or the paper states",
    messages: {
      notPng: "{{file}} is not a PNG file",
      size: "{{file}} is {{got}} px, and the one-slide must be {{want}} px",
    },
  },
  "captions-cover": {
    type: "suggestion",
    description:
      "the talk's captions cover the video: they start near its start, end near its end, and leave no long gap",
    schema: [
      {
        type: "object",
        properties: {
          maxStartS: { type: "number", minimum: 0 },
          maxEndGapS: { type: "number", minimum: 0 },
          maxGapS: { type: "number", minimum: 0 },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      noCues: "{{file}} holds no caption cues",
      lateStart:
        "{{file}}: the first caption starts at {{first}}, later than {{max}} s into the video",
      earlyEnd:
        "{{file}}: the last caption ends at {{last}}, and the video runs {{video}} — more than {{max}} s uncaptioned at the end",
      gap: "{{file}}: {{s}} s without a caption from {{at}}, longer than {{max}} s",
    },
  },
};

/** The level each talk rule is on at, for every `paper.tex`. Silent for a paper without `talk`. */
export const TALK_RULE_LEVELS: Readonly<
  Record<`talk/${TalkRuleName}`, "error" | "warn">
> = {
  "talk/profile": "error",
  "talk/required-files": "error",
  "talk/undeclared": "warn",
  "talk/duration": "error",
  "talk/duration-floor": "warn",
  "talk/video-format": "error",
  "talk/one-slide-size": "error",
  "talk/captions-cover": "warn",
};

function rule(name: TalkRuleName, deps: TalkRuleDeps): VenueRuleModule {
  const meta = META[name];
  return {
    meta: {
      type: meta.type ?? "problem",
      docs: { description: meta.description, url: rulePageUrl(`talk/${name}`) },
      schema: meta.schema ?? [],
      messages: meta.messages,
    },
    create(context) {
      if (basename(context.filename) !== "paper.tex") return {};
      return {
        root() {
          const cwd = context.cwd;
          const shown = (p: string) => (cwd ? relative(cwd, p) || p : p);
          const a = assess(dirname(context.filename), deps);
          const loc = { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } };
          findingsOf(name, a, { deps, options: context.options, shown }).forEach(
            (f) => {
              context.report({ loc, messageId: f.messageId, data: f.data });
            },
          );
        },
      };
    },
  };
}

/** The talk rules, as the rules of the `talk` plugin. */
export function talkRules(
  deps: TalkRuleDeps,
): Readonly<Record<TalkRuleName, VenueRuleModule>> {
  return {
    profile: rule("profile", deps),
    "required-files": rule("required-files", deps),
    undeclared: rule("undeclared", deps),
    duration: rule("duration", deps),
    "duration-floor": rule("duration-floor", deps),
    "video-format": rule("video-format", deps),
    "one-slide-size": rule("one-slide-size", deps),
    "captions-cover": rule("captions-cover", deps),
  };
}
