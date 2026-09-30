/**
 * THE TALK — what a venue asks a presenter to send, and what one paper declares about its talk.
 *
 * paperlint does not make a talk. It judges the finished files (the video, the one-slide image, the
 * captions) against the venue's numbers: however the video was made, the venue limits the file.
 *
 *   venue preset `talk`    the modes the venue allows, what each mode owes, the slot of each kind
 *                          of paper, the video's format, the one-slide's size
 *   paper `talk`           the mode this paper presents in, the folder the files are in, and their
 *                          names when they are not the defaults
 */
import { err, ok, type Result } from "./result.ts";
import { fieldOf, isRecord } from "./record.ts";

/** How a paper is presented. */
export type TalkMode = "in-person" | "remote-video" | "remote-live";
export const TALK_MODES: readonly TalkMode[] = [
  "in-person",
  "remote-video",
  "remote-live",
];

/** A file a mode can owe. */
export type TalkArtifact =
  | "video"
  | "one-slide"
  | "captions"
  | "slides-pdf"
  | "poster";
export const TALK_ARTIFACTS: readonly TalkArtifact[] = [
  "video",
  "one-slide",
  "captions",
  "slides-pdf",
  "poster",
];

/** What one mode owes. */
export interface TalkObligation {
  readonly required: readonly TalkArtifact[];
  readonly optional: readonly TalkArtifact[];
}

/** The talk slot of one kind of paper, in seconds. */
export interface TalkSlot {
  /** The whole slot, talk and questions. Informational. */
  readonly slotS: number;
  /** The shortest talk the venue asks for; null when it sets no floor. */
  readonly talkSMin: number | null;
  /** The longest talk. */
  readonly talkSMax: number;
  /** The questions' share. Informational. */
  readonly qaS: number | null;
}

/** A pixel size. */
export interface PixelSize {
  readonly width: number;
  readonly height: number;
}

/** The venue's limits on the video file. Every field null when the venue says nothing of it. */
export interface VideoLimits {
  readonly container: "mp4" | null;
  readonly minHeightPx: number | null;
  readonly maxBytes: number | null;
  readonly captions: "required" | "optional" | null;
}

/** A venue preset's `talk` block, parsed. */
export interface VenueTalk {
  /** The modes the venue allows; empty when the block names none. */
  readonly modes: readonly TalkMode[];
  readonly artifacts: ReadonlyMap<TalkMode, TalkObligation>;
  /** Slots by paper kind — the names of `format.kinds`. */
  readonly kinds: ReadonlyMap<string, TalkSlot>;
  readonly video: VideoLimits;
  /** The one-slide image's size; null when the venue does not state one. */
  readonly oneSlide: PixelSize | null;
}

/** The artifact → the file name it is looked for under, in the talk folder. */
export type TalkFiles = Readonly<Record<TalkArtifact, string>>;

/** The default talk folder, relative to the paper. */
export const DEFAULT_TALK_DIR = "talk";

/** The file each artifact is looked for under, unless the paper names another. */
export const DEFAULT_TALK_FILES: TalkFiles = {
  video: "talk.mp4",
  "one-slide": "one-slide.png",
  captions: "talk.srt",
  "slides-pdf": "slides.pdf",
  poster: "poster.pdf",
};

/** A paper's `talk` key, parsed. */
export interface PaperTalk {
  readonly mode: TalkMode;
  /** The talk folder, relative to the paper. */
  readonly dir: string;
  readonly files: TalkFiles;
  /** The one-slide's size when the paper states it (the venue did not); null otherwise. */
  readonly oneSlide: PixelSize | null;
}

// ── measurements the rules judge ──────────────────────────────────────────────────────────

/** What the video file says about itself. */
export interface VideoProbe {
  /** The container's duration (movie header), in seconds. */
  readonly durationS: number;
  /** The first audio track's duration, in seconds; null when the file has no audio track. */
  readonly audioS: number | null;
  /** The first video track's height in pixels; null when the file has no video track. */
  readonly heightPx: number | null;
  readonly widthPx: number | null;
  /** The file's brands (ftyp): `isom`, `mp41`… for MP4, `qt  ` for QuickTime. */
  readonly brands: readonly string[];
}

/** One caption cue, in seconds. */
export interface Cue {
  readonly startS: number;
  readonly endS: number;
}

// ── the preset's `talk` block, as the schema admits it ───────────────────────────────────

/** A preset's `talk` block after `venue-profile.schema.json` accepted it. */
export interface VenueTalkJson {
  readonly modes?: readonly TalkMode[];
  readonly artifacts?: Readonly<
    Partial<
      Record<
        TalkMode,
        {
          readonly required: readonly TalkArtifact[];
          readonly optional?: readonly TalkArtifact[];
        }
      >
    >
  >;
  readonly kinds?: Readonly<
    Record<
      string,
      {
        readonly slot_s: number;
        readonly talk_s_min?: number;
        readonly talk_s_max: number;
        readonly qa_s?: number;
      }
    >
  >;
  readonly video?: {
    readonly container?: "mp4";
    readonly min_height_px?: number;
    readonly max_bytes?: number;
    readonly captions?: "required" | "optional";
  };
  readonly one_slide?: { readonly width_px: number; readonly height_px: number };
}

/** The schema-checked block → the typed venue talk. Pure. */
export function venueTalkOf(j: VenueTalkJson): VenueTalk {
  return {
    modes: j.modes ?? [],
    artifacts: new Map(
      TALK_MODES.flatMap((mode) => {
        const o = j.artifacts?.[mode];
        return o === undefined
          ? []
          : [[mode, { required: o.required, optional: o.optional ?? [] }]];
      }),
    ),
    kinds: new Map(
      Object.entries(j.kinds ?? {}).map(([name, k]) => [
        name,
        {
          slotS: k.slot_s,
          talkSMin: k.talk_s_min ?? null,
          talkSMax: k.talk_s_max,
          qaS: k.qa_s ?? null,
        },
      ]),
    ),
    video: {
      container: j.video?.container ?? null,
      minHeightPx: j.video?.min_height_px ?? null,
      maxBytes: j.video?.max_bytes ?? null,
      captions: j.video?.captions ?? null,
    },
    oneSlide:
      j.one_slide === undefined
        ? null
        : { width: j.one_slide.width_px, height: j.one_slide.height_px },
  };
}

// ── a paper's `talk` key ───────────────────────────────────────────────────────────────────

const PAPER_TALK_KEYS = ["mode", "dir", "files", "one_slide"];

const isMode = (v: unknown): v is TalkMode =>
  TALK_MODES.some((m) => m === v);
const isArtifact = (v: string): v is TalkArtifact =>
  TALK_ARTIFACTS.some((a) => a === v);
const isPlainName = (v: unknown): v is string =>
  typeof v === "string" && v !== "" && !v.includes("/") && !v.includes("\\");
const isPositiveInt = (v: unknown): v is number =>
  typeof v === "number" && Number.isInteger(v) && v > 0;

/** `files`: each key an artifact, each value a file name in the talk folder. */
function filesOf(v: unknown): Result<TalkFiles, string> {
  if (v === undefined) return ok(DEFAULT_TALK_FILES);
  if (!isRecord(v)) return err(`"talk.files" must be an object`);
  const bad = Object.entries(v).find(
    ([k, name]) => !isArtifact(k) || !isPlainName(name),
  );
  if (bad !== undefined)
    return err(
      `"talk.files": "${bad[0]}" must be one of ${TALK_ARTIFACTS.join(", ")}, naming a file in the talk folder (no slashes)`,
    );
  const named = Object.fromEntries(
    Object.entries(v).filter(
      (e): e is [string, string] => typeof e[1] === "string",
    ),
  );
  return ok({ ...DEFAULT_TALK_FILES, ...named });
}

/** `one_slide`: `{ width_px, height_px }`, both positive integers. */
function oneSlideOf(v: unknown): Result<PixelSize | null, string> {
  if (v === undefined) return ok(null);
  const w = fieldOf(v, "width_px");
  const h = fieldOf(v, "height_px");
  return isPositiveInt(w) && isPositiveInt(h)
    ? ok({ width: w, height: h })
    : err(`"talk.one_slide" must be { "width_px": <integer>, "height_px": <integer> }`);
}

/**
 * A paper's `talk` value → the typed declaration; null when absent. Strict like the rest of the
 * file: an unknown key is refused by name, or a typo would read as "not set".
 */
export function parsePaperTalk(v: unknown): Result<PaperTalk | null, string> {
  if (v === undefined) return ok(null);
  if (!isRecord(v)) return err(`"talk" must be an object with a "mode"`);
  const unknown = Object.keys(v).find((k) => !PAPER_TALK_KEYS.includes(k));
  if (unknown !== undefined)
    return err(
      `"talk" has an unknown key "${unknown}" — known: ${PAPER_TALK_KEYS.join(", ")}`,
    );
  const mode = v["mode"];
  if (!isMode(mode))
    return err(`"talk.mode" must be one of ${TALK_MODES.join(", ")}`);
  const dir = v["dir"] ?? DEFAULT_TALK_DIR;
  if (typeof dir !== "string" || dir === "")
    return err(`"talk.dir" must be a folder relative to the paper`);
  const files = filesOf(v["files"]);
  if (!files.ok) return files;
  const oneSlide = oneSlideOf(v["one_slide"]);
  if (!oneSlide.ok) return oneSlide;
  return ok({ mode, dir, files: files.value, oneSlide: oneSlide.value });
}
