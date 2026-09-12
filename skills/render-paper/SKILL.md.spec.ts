// Compiled to SKILL.md by `vigiles compile`. Edit THIS file, never the markdown.
//
// Adopted 2026-08-17 as part of the second batch. The body is the previous SKILL.md
// VERBATIM, so the compiled diff shows only what the compiler adds. No `disallowedTools`
// fence yet: the field exists on `SkillSpec` as of the branch `claude/skill-disallowed-tools`
// but is not in a release `mine` installs, so adding it here would not compile.
import { experimental_skill } from "vigiles/spec";

export default experimental_skill({
  name: "render-paper",
  description: "Compile a LaTeX paper (ACM/IEEE/arXiv) to PDF and render its pages to high-DPI PNGs for mobile/on-screen review. Use whenever asked to \"render / compile / show / screenshot\" a .tex paper, or to produce phone-readable page images of a draft (e.g. ACM/IEEE workshop submissions). Encodes the toolchain + the gotchas already hit (font-expansion crash, filecontents bib, bibtex cycle).",
  tools: ["Read", "Write", "Edit", "Grep", "Glob", "Bash", "SendUserFile"],
  body: `
# render-paper — .tex → PDF → readable page PNGs

## Run me

🔴 FIRST, before any other step:

\`\`\`
node .claude/skills/paper-pipeline/scripts/announce.mjs render-paper <paper-dir>
\`\`\`

An advisory pass cannot be observed failing — silence is both its error state and its normal
state — so starting is an event, and events get written down.

Turns a LaTeX source into (a) a compiled PDF and (b) per-page PNG images crisp enough to read
the font on a phone. Encodes the exact toolchain and the failures already debugged, so it works
first try.

## 🔴 This is a COMMAND, not a stage

You run it twenty times a day. It has no position in the pipeline and nothing waits its turn to reach
it: **any \`.tex\` / \`paper.md\` edit is the trigger** — render, then eyeball pages 1–2 before believing
anything you say about the paper. Scorecard row **\`render\`** (in the CONTINUOUS section of
\`paper-pipeline\`) records the last render and its page count; that page count is the hard input the
\`tighten-paper\` structure gate is blocked on, which is the only sense in which anything "comes after"
this.

*It used to carry a number in a stage list, which made a compile look like a milestone you pass once.
That list was replaced on 2026-08-03; nothing about the toolchain below changed.*

## Toolchain (one command, not a checklist)
- **Compiler:** run this and stop thinking about it — it checks what is present, installs only if
  something is missing, and verifies afterwards that the binaries it came for actually appeared:
  \`\`\`
  bash .claude/skills/render-paper/ensure-toolchain.sh          # pdflatex, bibtex, pdfinfo
  bash .claude/skills/render-paper/ensure-toolchain.sh --acm    # + acmart.cls for ACM venues
  \`\`\`
  Measured 2026-08-17: 172 MB fetched, 482 MB on disk, ~1 min, and only on a session that renders.
  It installs **only** as root with apt (a disposable container); anywhere else it prints the
  command and exits 1, because half a gigabyte of unasked system packages is fine in a container
  and rude on a laptop. \`AUTO_INSTALL_TEX=0\` forces the report-only path.

  🔴 The package list lives **only** in that script. It used to be written out here AND in
  \`compile-rules-2026/repro/build-submission.sh\`, and the two had already drifted: this one had no
  \`poppler-utils\` (so \`pdfinfo\` was missing and the page-count gate could not run), that one had no
  \`texlive-publishers\` (so \`acmart.cls\` was missing and an ACM paper did not compile). Each was
  correct for its own file and wrong for the other. Do not restate it a third time.

  Still true and still the reason it is apt: \`curl|sh\` installers are blocked (the sandbox refuses
  piping remote scripts) and \`tectonic\` is not on this image — and would not be a drop-in anyway,
  since the build calls \`bibtex\` and \`pdfinfo\` as binaries and tectonic ships neither.
- **Renderer:** \`pip install --quiet pymupdf\` (poppler \`pdftoppm\`/ghostscript are often missing or
  404 on apt here; pymupdf is reliable). No \`playwright install\`, no external fetches.

## Compile (full bibtex cycle — needed or citations show as \`[?]\`)
\`\`\`
cd <paper-dir>
pdflatex -interaction=nonstopmode paper.tex
bibtex paper
pdflatex -interaction=nonstopmode paper.tex
pdflatex -interaction=nonstopmode paper.tex   # twice more resolves refs + citations
\`\`\`
Check the last log: \`grep -iE "Fatal|Output written" \` and
\`grep -ciE "Undefined control|Citation.*undefined|Reference.*undefined"\` (must be 0).

### MECHANICAL RENDER GATE (run this — do not just eyeball)
Eyeballing a page or two misses \`Overfull \\hbox\` defects on later pages (text/tables bleeding
past the column into the margin — the #1 "wtf, formatting is broken" bug). LaTeX reports every one
in the \`.log\`; **\`check-render.sh\` parses them so it's a checked fact, not a hope:**
\`\`\`
bash .claude/skills/render-paper/check-render.sh <paper-dir> [texbasename=paper] [threshold_pt=5]
\`\`\`
It compiles, then FAILS (exit 1) on: any \`Overfull \\hbox\` ≥ threshold (visible overflow), any
\`Overfull \\vbox\`, or any undefined reference/citation/control-sequence. **A paper is not "renders
clean" until this exits 0.** Common fixes when it fails:
- **Long \`\\texttt{...}\` / literal commands / URLs overflowing** → wrap in \`\\seqsplit{}\`, or use
  \`\\url{}\` (breakable), or a \`p{width}\`/\`>{\\ttfamily\\small}p{width}\` table column instead of \`l\`,
  or shrink the block with \`\\small\`/\`\\footnotesize\`.
- **Wide table** → \`\\small\` + fixed-width \`p{}\` columns so cells wrap; or \`\\resizebox{\\columnwidth}{!}{...}\`.
- Re-run the gate until PASS.

## KNOWN GOTCHAS (already hit — apply proactively)
1. **\`pdfTeX error (font expansion): auto expansion is only possible with scalable fonts\`** — acmart +
   microtype want Libertine outlines that \`texlive-fonts-recommended\` may lack. Fix: add
   \`\\microtypesetup{expansion=false}\` in the preamble (after \`\\documentclass\`). This is the #1 crash.
2. **\`Undefined control sequence \\lesssim\` / \`\\gtrsim\`** — need \`amssymb\`; either \`\\usepackage{amssymb}\`
   or replace with \`\\le\`/\`\\ge\`.
3. **Bibliography via embedded \`\\begin{filecontents*}[overwrite]{refs.bib}...\`** before
   \`\\documentclass\` works and keeps the paper one-file; still run the full bibtex cycle above.
   ⚠️ **The block IS the source of truth — it \`overwrite\`s \`refs.bib\` on every build.** Editing \`refs.bib\`
   directly does nothing (regenerated away); fix citations INSIDE the filecontents block in the \`.tex\`.
   Consider \`.gitignore\`-ing the generated \`refs.bib\` so it can't drift from the block.
4. **Double-blind:** ACM uses \`\\documentclass[sigconf,review,anonymous]{acmart}\`; keep author
   \`Anonymous Author(s)\` for the review PDF.
5. **\`.gitignore\`** the build junk (\`*.aux *.log *.out *.bbl *.blg\`); keep \`paper.pdf\` if you want it
   version-controlled, else ignore it too.
6. **Multi-token shell commands in \`\\texttt{}\` break at their internal space** — \`\\texttt{rm -rf}\` can wrap
   as \`rm\` ⏎ \`-rf\`, which reads as broken typesetting. This is a LEGAL break, so it raises **no** Overfull
   warning and the render gate is blind to it. Fix: non-breaking ties — \`\\texttt{rm~-rf~/}\` (or wrap in
   \`\\mbox{}\`). The space *before an argument* (\`rm~-rf node\\_modules\`) stays breakable — only tie the
   command tokens. \`check-render.sh\` now greps for a literal space inside \`\\texttt{…}\` and warns.
7. **Page-limit / body-end: trust the RENDERED References-start page, NOT \`\\newlabel{tmpbodyend}\` in the
   \`.aux\`.** The aux label lags one compile (it reflects the *previous* build's pagination), so it triggers
   false page-limit alarms — this session it read "p11" while the body genuinely ended on p10. To check the
   body length: open the built PDF, find the page where the \`\\section*{References}\`/\`REFERENCES\` heading
   first appears (that page = last body page). \`python3 -c "import fitz;d=fitz.open('paper.pdf');[print('refs p',i+1) for i in range(d.page_count) if 'REFERENCES' in d[i].get_text()][:1]"\`. Never gate a page-limit decision on the aux value.

## Render pages to PNGs
\`\`\`
python3 -c "import fitz; d=fitz.open('paper.pdf'); \\
  [d[i].get_pixmap(dpi=200).save(f'/<scratch>/p{i+1}.png') for i in range(d.page_count)]; \\
  print('rendered', d.page_count)"
\`\`\`
- **DPI 200** = phone-readable (zoomable); use 150 for quick previews, 300 for print-check.
- Write PNGs to the session scratchpad, not the repo.
- **The mechanical gate above (\`check-render.sh\`) is the primary defense** for text/table overflow and
  undefined refs — run it first, on the whole document, and get it to PASS.
- **Then eyeball EVERY page** (not just 1–2) for the defects the log CANNOT flag: **figure-internal
  label collisions** (TikZ/pgfplots nodes overlapping axis labels or each other — e.g. a legend
  landing on an axis tick), color/legibility, misaligned sub-figures. These do not raise an Overfull
  warning, so a human scan of each figure is still required. Fix and re-render until clean.

## Deliver
- Send the PNGs with \`SendUserFile\` (\`display: render\`) so the user can read on phone; caption what
  changed since the last render. Send the PDF too (\`display: attach\`) if they want the file.

## Record the verdict

🔴 LAST step, once the deliverable exists:

\`\`\`
node .claude/skills/paper-pipeline/scripts/ledger.mjs record render-paper <paper-dir> FINDING <count> <report-path>
node .claude/skills/paper-pipeline/scripts/ledger.mjs record render-paper <paper-dir> ABSTAINED <reason> "<one line>"
\`\`\`

🔴 **There is no PASS**, not even here, where the temptation is strongest — an exit code of 0 from
\`check-render.sh\` means the parser found no defect in the log, which is not the same as the page
being right, and the delivered-PDF check exists because that difference once put \`7 x 10^13\` on
page one.

**FINDING** — \`check-render.sh\` exited non-zero; \`<count>\` is Overfull boxes plus undefined
refs/citations and \`<report-path>\` is the log. Always \`--blocking\`: every one of these is a fact
about the artifact, never a matter of taste.
**ABSTAINED** — \`no-witness\`: it compiled and the log parser found nothing. \`input-missing\`: there
is no \`.tex\` to compile. \`crashed\`: no LaTeX toolchain on this machine, which must never be read
as a clean render.

It runs twenty times a day, so the ledger fills with rows, and that is fine: each row pins a page count
to a specific set of paper bytes, which is exactly what the \`tighten-paper\` structure gate is blocked
on and what a remembered page count keeps getting wrong.

## Compose with
- \`paper-adversarial-review\` / \`pc-panel-review\` (incl. its venue-fit mode) — review the rendered draft.`,
});
