/**
 * The PAGE of build-label-page's generator: the one closed-choice page (`page-template.html`, its
 * style and browser script kept as exact bytes), filled with the core's payload. Another page shape
 * would be another template here, on the same core.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { prepareBuild, say, type Payload } from "./label-page-core.ts";

const TEMPLATE = readFileSync(
  join(import.meta.dirname, "page-template.html"),
  "utf8",
);
const escapeHtml = (text: string): string =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
/** JSON as the page always carried it: `", "` and `": "` between entries, Unicode kept. */
const compactJson = (v: unknown): string => {
  if (Array.isArray(v)) return `[${v.map(compactJson).join(", ")}]`;
  if (typeof v !== "object" || v === null) return JSON.stringify(v);
  return `{${Object.entries(v)
    .map(([k, x]) => `${JSON.stringify(k)}: ${compactJson(x)}`)
    .join(", ")}}`;
};

/** The page: the template with its title and its data. */
export function pageHtml(payload: Payload): string {
  // `</` inside JSON inside a <script> would end the script early.
  const data = compactJson(payload).replaceAll("</", "<\\/");
  return TEMPLATE.replaceAll("__TITLE__", () =>
    escapeHtml(payload.title),
  ).replaceAll("__DATA__", () => data);
}
/** items.json → out/page.html and out/key.json. */
export function build(configPath: string, outDir: string): void {
  const { payload, dropped } = prepareBuild(configPath, outDir);
  writeFileSync(join(outDir, "page.html"), pageHtml(payload), "utf8");
  say(
    `built ${join(outDir, "page.html")}: ${String(payload.items.length)} items, ${String(payload.groups.length)} groups${dropped ? `, ${String(dropped)} left out (labeller does not know their group)` : ""}`,
  );
  say(
    `wrote ${join(outDir, "key.json")}: the only link from G-ids to source ids; it is NOT part of the page`,
  );
}
