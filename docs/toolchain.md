# External programs the skills need

`rpp lint` needs nothing but Node — it reads your files and reports. **The skills are a different
matter**: they build PDFs, read them back, and run external checkers, so they call programs this
package does not ship.

This page is the prerequisite list and how to satisfy it cheaply. It was moved out of the README
on 2026-09-19: it answers "how do I make the render stage work", which is a question you have
after deciding to use the tool, not before.

## The programs

| program              | comes from                 | which skills call it                     | what happens without it                                            |
| -------------------- | -------------------------- | ---------------------------------------- | ------------------------------------------------------------------ |
| `pdflatex`, `bibtex` | TeX Live (`rpp toolchain`) | render-paper, submit-paper, camera-ready | no PDF is produced — loud                                          |
| `texcount`           | TeX Live (`rpp toolchain`) | render-paper, grade-paper-writing        | the length checks cannot run                                       |
| `checkcites`         | TeX Live (`rpp toolchain`) | render-paper                             | nothing asks whether a bibliography entry is uncited               |
| `java`               | any JRE (21 works)         | render-paper                             | TeXtidote does not run, and **nothing else spell-checks the text** |
| `python3`            | your system                | the analysis and report scripts          | those scripts do not start                                         |
| `tlmgr`              | TeX Live                   | the TeX installer itself                 | you cannot add a TeX package                                       |

🔴 **Most of these fail QUIETLY**, which is why they are listed rather than left to be discovered.
A missing checker and a passing checker look identical from outside, so every script here states in
its last line which checks actually ran — read that line, not the exit code.

## TeX Live: `rpp toolchain`

```sh
npx rpp toolchain            # install, or add what is missing; a second run does nothing
npx rpp toolchain --check    # report, change nothing; exit 1 when a declared package is missing
```

It downloads `install-tl` from a CTAN mirror (four in turn; each download has its own time limit,
TLS is always verified), installs `scheme-basic` into `~/.cache/rpp/texlive/<TeX Live year>`
(`$XDG_CACHE_HOME/rpp/texlive` when that is set, `$RPP_TEXLIVE_DIR` over both), and `tlmgr install`s
every package the venue profiles declare. Then it checks the RESULT: `kpsewhich` must find every
file each profile names, and each declared tool must be an executable in the bin directory. A gap
fails the command and names the package and its file. Linux and macOS; on Windows it refuses, and
`rpp build` uses a TeX Live on PATH that has the packages. `RPP_CTAN_MIRROR` names one mirror
(a `…/systems/texlive/tlnet` URL) to use instead of the list.

Measured 2026-09-24 from an empty directory: **3 min 04 s, 269 MB** (du: 298 MB), TeX Live 2026, 47
packages verified (46 files, 2 tools). The second run: 0.55 s, "nothing to do".

**When CTAN moves to a new TeX Live year.** A complete tree is left alone: a new release on CTAN is
not by itself a reason to download 270 MB. It matters only when a venue declares a package the
tree lacks — tlmgr then refuses to install into an older year (`Local TeX Live (2026) is older
than remote repository (2027)`). `rpp toolchain` reads the two years from that refusal, installs
a fresh tree for the new year into its own `<TeX Live year>` directory, installs every declared
package there and verifies it, and from then on that tree is used. The old tree is not deleted;
the run names it with its size, and removing it is your call. `rpp build` uses the newest tree
that has every declared package, so a new-year install that was interrupted never replaces a
complete older one.

**Where the package list lives:** in the venue profiles, not here and not in a script.
`skills/submit-paper/references/venues/<venue>.jsonc` carries a `tex` block — CTAN package → the
files that prove it is installed — and `tex-base.jsonc` carries what every paper gets, and all a
paper with an unknown venue gets. The shape is `venue-profile.schema.json` in the same directory.
A venue that needs a new package gets one line there.

**`rpp build` uses it without being asked to.** It looks for a TeX Live with every package the
paper's venue declares — rpp's own first, then the `pdflatex` on PATH — and on a terminal offers to
install one. Without a terminal it stops with one line naming `npx rpp toolchain`. The last line
`rpp toolchain` prints is `bin: <dir>`: put that first on PATH to call `pdflatex`, `texcount` or
`checkcites` by hand, or from a skill's script.

Why upstream TeX Live by package name and not the distribution packages: `texlive-fonts-extra`
alone is **1691 MB**, and acmart papers use **47 MB** of it — apt cannot install less. The measured
comparison of every method tried (containers, apt, a GitHub Action, this) is
[`texlive-install-decision.md`](texlive-install-decision.md).

## Reading the PDF: nothing to install

`rpp build` and `extract-pdf-facts.mjs` read the finished PDF — page count, the fonts it draws text
with, the last page's words — with **pdf.js**, which arrives with rpp as the npm dependency
[`unpdf`](https://www.npmjs.com/package/unpdf). Until 2026-09-24 this took three poppler programs
(`pdfinfo`, `pdffonts`, `pdftotext`) from the system package manager; a measurement on 25 PDFs
found pdf.js equal on page counts and Type 3 fonts, and the last page's column heights within
0.2 pt except on an all-Type-3 page (7.2 pt). Poppler is no longer needed by anything rpp runs.

pdf.js needs **Node 22.13 or later**, which rpp requires anyway: on Node 20 it opens the same PDFs
and reports zero fonts without an error, and rpp refuses such a read instead of reporting a
clean font list.

## The external checkers

`aclpubcheck` (the official ACL format checker), TeXtidote (spelling) and `rebiber` are not TeX
packages and not npm packages. One idempotent command installs them and then **proves each one
starts**:

```sh
bash node_modules/research-paper-pipeline/skills/render-paper/ensure-checkers.sh
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
