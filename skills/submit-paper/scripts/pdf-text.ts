#!/usr/bin/env node
/**
 * pdf-text — the text of a PDF, every page in order, read with pdf.js through the same reader
 * `paperlint build` uses (`src/pdf-facts.ts`). `check-deanon.sh` greps it for the author's
 * identifiers.
 *
 * Usage: node pdf-text.js <pdf>
 * Exit 0: the text is on stdout, a line break after each line. Exit 2: the PDF could not be read
 * (unreadable, encrypted, no pages), named on stderr, or a usage error. Never an empty exit 0 for a
 * PDF it did not open: the gate that reads stdout would then pass a document nobody scanned.
 *
 * A consumer runs the bundle `pdf-text.js` (`scripts/bundle-skills.ts`), which carries pdf.js
 * inside it, so nothing is installed for it.
 */
import { describeFailure, readPdf } from "#src/pdf-facts";

const [pdf, ...rest] = process.argv.slice(2);
if (pdf === undefined || rest.length > 0) {
  process.stderr.write("usage: node pdf-text.js <pdf>\n");
  process.exitCode = 2;
} else {
  const read = await readPdf(pdf);
  if (read.ok) process.stdout.write(`${read.facts.pageTexts.join("\n")}\n`);
  else {
    process.stderr.write(`${describeFailure(read, pdf)}\n`);
    process.exitCode = 2;
  }
}
