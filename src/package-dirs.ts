/**
 * Where the package's own data lives, wherever the package is installed (its checkout,
 * `node_modules`, a plugin cache). This file sits one level below the package root both as a source
 * (`src/`) and as a build (`dist/`), so `..` is the root in either.
 *
 *   presets/       the venue presets (`paperlint:<name>`) and their JSON Schema
 *   presets/tex/   the LaTeX inputs `paperlint build` puts on TEXINPUTS
 */
import { fileURLToPath } from "node:url";

/** The shipped venue presets and `venue-profile.schema.json`. */
export const presetsDir = (): string =>
  fileURLToPath(new URL("../presets", import.meta.url));

/** The LaTeX inputs a paper `\input`s by name (`paper-guards`, a venue's numbers). */
export const texInputsDir = (): string =>
  fileURLToPath(new URL("../presets/tex", import.meta.url));
