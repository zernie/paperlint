/**
 * Where the package's own data lives, wherever the package is installed (its checkout,
 * `node_modules`, a plugin cache). This file sits one level below the package root both as a source
 * (`src/`) and as a build (`dist/`), so `..` is the root in either.
 *
 *   presets/       the venue presets (`paperlint:<name>`) and their JSON Schema
 *   presets/tex/   the LaTeX inputs `paperlint build` puts on TEXINPUTS
 *
 * `texSearchPath` is where an `\input` is looked for, in order. The build hands it to TeX and the
 * lint rules read includes through it, so the two cannot disagree about which file a paper means.
 */
import { fileURLToPath } from "node:url";

/** The shipped venue presets and `venue-profile.schema.json`. */
export const presetsDir = (): string =>
  fileURLToPath(new URL("../presets", import.meta.url));

/** The LaTeX inputs a paper `\input`s by name (`paper-guards`, a venue's numbers). */
export const texInputsDir = (): string =>
  fileURLToPath(new URL("../presets/tex", import.meta.url));

/** Where an `\input` in the paper in `paperDir` is looked for, first to last. */
export const texSearchPath = (paperDir: string): readonly string[] => [
  paperDir,
  texInputsDir(),
];
