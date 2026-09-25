# External programs the skills need

`paperlint lint` needs nothing but Node — it reads your files and reports. **The skills are a different
matter**: they build PDFs, read them back, and run external checkers, so they call programs this
package does not ship.

This page is the prerequisite list and how to satisfy it cheaply. It was moved out of the README
on 2026-09-19: it answers "how do I make the render stage work", which is a question you have
after deciding to use the tool, not before.

## The programs

| program              | comes from                       | which skills call it                     | what happens without it                                               |
| -------------------- | -------------------------------- | ---------------------------------------- | --------------------------------------------------------------------- |
| `pdflatex`, `bibtex` | TeX Live (`paperlint toolchain`) | render-paper, submit-paper, camera-ready | no PDF is produced — loud                                             |
| `texcount`           | TeX Live (`paperlint toolchain`) | render-paper, grade-paper-writing        | the length checks cannot run                                          |
| `checkcites`         | TeX Live (`paperlint toolchain`) | render-paper                             | nothing asks whether a bibliography entry is uncited                  |
| `java`               | any JRE (21 works)               | render-paper                             | TeXtidote does not run, and **nothing else spell-checks the text**    |
| `python3`            | your system                      | the analysis and report scripts          | those scripts do not start                                            |
| `tlmgr`              | TeX Live                         | the TeX installer itself                 | you cannot add a TeX package                                          |
| `banal`              | HotCRP (`paperlint toolchain`)   | `paperlint build`, extract-pdf-facts     | page size, columns and font sizes are `null` in the facts file        |
| `perl`               | your system (macOS has it)       | banal                                    | banal cannot run — the same `null`, and `paperlint toolchain` refuses |

🔴 **Most of these fail QUIETLY**, which is why they are listed rather than left to be discovered.
A missing checker and a passing checker look identical from outside, so every script here states in
its last line which checks actually ran — read that line, not the exit code.

## TeX Live and banal: `paperlint toolchain`

```sh
npx paperlint toolchain            # install, or add what is missing; a second run does nothing
npx paperlint toolchain --check    # report, change nothing; exit 1 when a declared package or banal is missing
```

The command has two halves, TeX Live and banal (below). Both always run, so one failing does not
hide the other, and the exit code is 0 only when both are ready.

It downloads `install-tl` from a CTAN mirror (four in turn; each download has its own time limit,
TLS is always verified), installs `scheme-basic` into `~/.cache/rpp/texlive/<TeX Live year>`
(`$XDG_CACHE_HOME/rpp/texlive` when that is set, `$RPP_TEXLIVE_DIR` over both), and `tlmgr install`s
every package the venue profiles declare. Then it checks the RESULT: `kpsewhich` must find every
file each profile names, and each declared tool must be an executable in the bin directory. A gap
fails the command and names the package and its file. Linux and macOS; on Windows it refuses, and
`paperlint build` uses a TeX Live on PATH that has the packages. `RPP_CTAN_MIRROR` names one mirror
(a `…/systems/texlive/tlnet` URL) to use instead of the list.

Measured 2026-09-24 from an empty directory: **3 min 04 s, 269 MB** (du: 298 MB), TeX Live 2026, 47
packages verified (46 files, 2 tools). The second run: 0.55 s, "nothing to do".

**When CTAN moves to a new TeX Live year.** A complete tree is left alone: a new release on CTAN is
not by itself a reason to download 270 MB. It matters only when a venue declares a package the
tree lacks — tlmgr then refuses to install into an older year (`Local TeX Live (2026) is older
than remote repository (2027)`). `paperlint toolchain` reads the two years from that refusal, installs
a fresh tree for the new year into its own `<TeX Live year>` directory, installs every declared
package there and verifies it, and from then on that tree is used. The old tree is not deleted;
the run names it with its size, and removing it is your call. `paperlint build` uses the newest tree
that has every declared package, so a new-year install that was interrupted never replaces a
complete older one.

**Where the package list lives:** in the venue profiles, not here and not in a script.
`skills/submit-paper/references/venues/<venue>.jsonc` carries a `tex` block — CTAN package → the
files that prove it is installed — and `tex-base.jsonc` carries what every paper gets, and all a
paper with an unknown venue gets. The shape is `venue-profile.schema.json` in the same directory.
A venue that needs a new package gets one line there.

**`paperlint build` uses it without being asked to.** It looks for a TeX Live with every package the
paper's venue declares — paperlint's own first, then the `pdflatex` on PATH — and on a terminal offers to
install one. Without a terminal it stops with one line naming `npx paperlint toolchain`. The last line
`paperlint toolchain` prints is `bin: <dir>`: put that first on PATH to call `pdflatex`, `texcount` or
`checkcites` by hand, or from a skill's script.

Why upstream TeX Live by package name and not the distribution packages: `texlive-fonts-extra`
alone is **1691 MB**, and acmart papers use **47 MB** of it — apt cannot install less. The measured
comparison of every method tried (containers, apt, a GitHub Action, this) is
[`texlive-install-decision.md`](texlive-install-decision.md).

## Reading the PDF: nothing to install

`paperlint build` and `extract-pdf-facts.mjs` read the finished PDF — page count, the fonts it draws text
with, the last page's words — with **pdf.js**, which arrives with paperlint as the npm dependency
[`unpdf`](https://www.npmjs.com/package/unpdf). Until 2026-09-24 this took three poppler programs
(`pdfinfo`, `pdffonts`, `pdftotext`) from the system package manager; a measurement on 25 PDFs
found pdf.js equal on page counts and Type 3 fonts, and the last page's column heights within
0.2 pt except on an all-Type-3 page (7.2 pt). Poppler is no longer needed by anything paperlint runs.

## Page geometry: banal, without poppler

The page size, column count, body and reference font sizes and page types in the facts file come
from **banal**, the page-geometry script HotCRP's format checker runs
([`src/banal`](https://github.com/kohler/hotcrp/blob/master/src/banal), by Geoffrey M. Voelker and
Eddie Kohler). paperlint runs the real banal, unmodified, so the numbers are the ones HotCRP shows at
upload.

banal normally reads a PDF through poppler's `pdftohtml -xml`. paperlint does not: it writes that XML
itself from the same pdf.js read (`src/adapters/banal/xml.ts`) and hands banal the `.xml` file, which banal
accepts as input. Measured on 50 PDFs / 598 pages (2026-09-25): banal on paperlint's XML and banal on
real `pdftohtml` agree on every field the facts file keeps, with no venue verdict changed. They
agree only because paperlint leaves out rotated and invisible text (as `pdftohtml` does), writes each
text's colour so banal drops light text by its own rule, and writes sizes and coordinates at the
zoom and precision banal expects. `test/e2e/banal.mjs` checks each of those against the real banal
on the committed fixtures.

**How it is installed — and the licence boundary.** banal is **GPL-2.0-or-later**; paperlint is MIT. paperlint
therefore does not contain banal. `paperlint toolchain` downloads it from HotCRP at a pinned commit:

|         |                                                                                                      |
| ------- | ---------------------------------------------------------------------------------------------------- |
| URL     | `https://raw.githubusercontent.com/kohler/hotcrp/f3e4352133f3184c7c42b0d5e6501124bead18e6/src/banal` |
| version | banal 1.2                                                                                            |
| sha256  | `fd8cc4ae189b9da02460ae442a34f14434e5784210489fb668313ac671006911`                                   |

It refuses a file with any other sha256, stores it in `~/.cache/rpp/banal/<commit>/banal`
(`$XDG_CACHE_HOME/rpp/banal` when set, `$RPP_BANAL_DIR` over both), and accepts it only after banal
has run on a one-page probe and measured it. paperlint then runs it as a separate program — `perl banal
-no-time -json <file>.xml` — and reads its JSON output. Nothing of banal is copied, linked or
translated into this package.

**perl is required** for that, and is checked: without it `paperlint toolchain` fails and says how to
install it (Debian/Ubuntu `apt-get install perl`; macOS ships it). banal asks `pdftohtml -v` before
it reads any input, so paperlint points banal's `$PDFTOHTML` at a small stub that answers with the
`pdftohtml` version whose XML paperlint writes. Poppler itself is not needed by anything paperlint runs.

**Which banal is used**, in order: `$BANAL` (a path you name), `vendor/banal` in the project (a copy
you vendor), then the one `paperlint toolchain` installed. Without any, `paperlint build` still succeeds with
the geometry fields `null` and says so with the command that fixes it; `extract-pdf-facts.mjs
--strict` fails.

pdf.js needs **Node 22.13 or later**, which paperlint requires anyway: on Node 20 it opens the same PDFs
and reports zero fonts without an error, and paperlint refuses such a read instead of reporting a
clean font list.

## The external checkers

`aclpubcheck` (the official ACL format checker), TeXtidote (spelling) and `rebiber` are not TeX
packages and not npm packages. One idempotent command installs them and then **proves each one
starts**:

```sh
bash node_modules/paperlint/skills/render-paper/ensure-checkers.sh
```

```
   ✅ aclpubcheck
   ✅ rebiber
   ✅ jinja2
   ✅ textidote (/opt/textidote/textidote.jar)
✅ all checkers are installed AND run
```

It checks that the tools RUN, not that pip exited zero — `aclpubcheck --help` prints usage and
exits zero on an interpreter where its own dependencies do not import, so "installed" and "works"
are separate questions here.
