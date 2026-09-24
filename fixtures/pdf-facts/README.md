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

The `.tex` sources are kept for provenance and are not built by any test. `ttf.tex` expects
`ArsenalSC-Regular.ttf` beside it (SIL Open Font License).
