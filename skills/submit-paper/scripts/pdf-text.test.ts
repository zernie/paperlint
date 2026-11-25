/**
 * pdf-text.ts: the text `check-deanon.sh` greps, read with pdf.js. Both halves: a PDF's lines come
 * out whole and in order, and a PDF that cannot be read is exit 2 with pdf.js's reason, never an
 * empty exit 0. Runs the SOURCE (`--conditions=paperlint-source`); check-deanon.test.ts runs the bundle.
 * Run: npx vitest run skills/submit-paper/scripts/pdf-text.test.ts
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { onePagePdf, runNode, useTempDir } from "../../../test/support.ts";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "pdf-text.ts");
const run = (args: readonly string[]) =>
  runNode(SCRIPT, args, { nodeArgs: ["--conditions=paperlint-source"] });

describe("pdf-text", () => {
  const dir = useTempDir("pdf-text-");

  it("prints every line of the PDF, a line break after each", () => {
    const pdf = join(dir, "paper.pdf");
    writeFileSync(
      pdf,
      onePagePdf(["Anonymous submission.", "Quillfeather-kit"]),
    );
    expect(run([pdf])).toEqual({
      status: 0,
      stdout: "Anonymous submission.\nQuillfeather-kit\n",
      stderr: "",
    });
  });

  it("a PDF pdf.js cannot read is exit 2 with its reason, and nothing on stdout", () => {
    const pdf = join(dir, "broken.pdf");
    writeFileSync(pdf, "%PDF-1.4\n% not a real pdf\n");
    expect(run([pdf])).toEqual({
      status: 2,
      stdout: "",
      stderr: `could not read ${pdf} with pdf.js (unreadable): InvalidPDFException: Invalid PDF structure.\n`,
    });
  });

  it("no PDF, or more than one argument, is a usage error", () => {
    const usage = {
      status: 2,
      stdout: "",
      stderr: "usage: node pdf-text.js <pdf>\n",
    };
    expect([run([]), run(["a.pdf", "b.pdf"])]).toEqual([usage, usage]);
  });
});
