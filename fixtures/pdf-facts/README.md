# PDF fixtures for the pdf.js reader

Real PDFs that `src/pdf-facts.harness.mjs` and `skills/render-paper/extract-pdf-facts.harness.mjs`
read. They were measured with poppler and with pdf.js on 2026-09-24 (issue #61); the harnesses pin
poppler's numbers, so a pass means agreement with the tool pdf.js replaced.

| file               | built from                                                          | what it carries                                                                                                                   |
| ------------------ | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `t3-all.pdf`       | `t3-all.tex`, pdflatex with the cm-super map removed                | four Type 3 fonts and nothing else: every T1 font falls back to bitmaps                                                           |
| `t3-mixed.pdf`     | `t3-mixed.tex`, pdflatex                                            | two embedded Type 1, one Type 3, and `Times-Roman` NOT embedded — `pdffonts` prints it `Type 1 Custom no no yes`                   |
| `ttf.pdf`          | `ttf.tex`, LuaLaTeX with the OFL font Arsenal SC                    | a composite TrueType font (`CID TrueType`) and a non-embedded Helvetica; two pages, the last a stub                               |
| `corrupt-font.pdf` | `t3-mixed.pdf` with the embedded CMR10 program's bytes damaged      | poppler still calls CMR10 embedded (with a syntax warning); pdf.js cannot parse the program and reports it not embedded           |
| `encrypted.pdf`    | `t3-all.pdf` saved with an AES-256 user password (PyMuPDF)          | pdf.js refuses it with `PasswordException`; the reader reports `encrypted`                                                        |
| `hidden-text.pdf`  | `hidden-text.tex`, pdflatex                                         | two-column body text beside near-white, rotated and render-mode-3 text; page 2 holds only hidden text, so banal calls it blank    |

`test/e2e/banal.mjs` also reads these files, with the real banal: it pins what banal 1.2 printed for
each one on poppler's `pdftohtml` 24.02.0 (2026-09-25), so a pass there means paperlint's pdf.js-written
XML measures the same as poppler's. `hidden-text.pdf` exists for that test: each kind of hidden text
changes banal's answer if it is counted.

The `.tex` sources are kept for provenance and are not built by any test. `ttf.tex` expects
`ArsenalSC-Regular.ttf` beside it (SIL Open Font License).
