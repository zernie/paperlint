/**
 * The packed `.claude-plugin/plugin.json` carries the package's version; the tracked one carries the
 * placeholder semantic-release leaves in `package.json`.
 *
 * 🔴 WHY THE VERSION MUST BE IN plugin.json. The marketplace installs the plugin from the npm package
 * (`.claude-plugin/marketplace.json`, source `npm`). Measured 2026-11-22 (Claude Code 2.1.330): an
 * npm-sourced plugin whose plugin.json and marketplace entry name no version is listed as version
 * "unknown" — Claude Code does not read `package.json` — so neither a person nor `paperlint doctor`
 * could tell which paperlint the plugin's skills and hooks belong to.
 *
 * `npm pack` and `npm publish` run `prepack` (stamp) and `postpack` (restore) around the tarball: by
 * then `@semantic-release/npm` has written the release's version into `package.json`. A local pack
 * of the placeholder stamps the placeholder, so nothing changes.
 */
import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** The version the tracked files carry between releases. */
export const PLACEHOLDER = "0.0.0-semantically-released";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

/** A JSON object's text with its `version` set, in the file's own two-space form. */
export function withVersion(json: string, version: string): string {
  const parsed: unknown = JSON.parse(json);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
    throw new Error("plugin.json is not a JSON object");
  return `${JSON.stringify({ ...parsed, version }, null, 2)}\n`;
}

/** `stamp`: the package's version into plugin.json; `restore`: the placeholder back. */
export function main(verb: string | undefined, root: string = ROOT): number {
  const plugin = join(root, ".claude-plugin", "plugin.json");
  const pkg: unknown = JSON.parse(
    readFileSync(join(root, "package.json"), "utf8"),
  );
  const version =
    typeof pkg === "object" && pkg !== null && "version" in pkg
      ? String(pkg.version)
      : PLACEHOLDER;
  const to =
    verb === "stamp" ? version : verb === "restore" ? PLACEHOLDER : null;
  if (to === null) {
    console.error("usage: node scripts/plugin-version.ts stamp|restore");
    return 2;
  }
  writeFileSync(plugin, withVersion(readFileSync(plugin, "utf8"), to));
  return 0;
}

// Imports nothing of the package: `npm pack` runs this before anything else, in a tree it may not resolve.
const invoked = process.argv[1];
if (
  invoked !== undefined &&
  realpathSync(invoked) === realpathSync(fileURLToPath(import.meta.url))
)
  process.exit(main(process.argv[2]));
