/**
 * A path as a caller gave it, made absolute where it enters a `Files` call.
 *
 * The app's use cases take paper directories and files as strings, and some callers pass them as
 * typed on a command line (`skills/render-paper/extract-pdf-facts.mjs <paper.pdf>`). A relative one
 * has always meant the process's cwd — `node:fs` resolved it there. Resolving it HERE, the same way,
 * makes the `AbsolutePath` brand a checked fact rather than an assertion: the value handed to the port
 * is absolute, and nothing downstream has to wonder.
 */
import { resolve } from "node:path";
import { absolutePath, type AbsolutePath } from "./domain/paths.ts";

export const callerPath = (p: string): AbsolutePath => absolutePath(resolve(p));
