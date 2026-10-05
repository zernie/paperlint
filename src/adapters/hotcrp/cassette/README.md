# HotCRP cassette

Real answers to the requests `paperlint submission` sends, recorded from a live HotCRP instance
through HotCRP's documented API (`/api/paper`). `portal.test.ts` replays them from its
local mock server and parses each one through the adapter's real zod schemas: a schema that rejects
a real answer is the defect class these files exist to catch. A hand-written mock body is what let
a wrong upload field name through once.

Only read-only requests were recorded: one `GET` and two `POST`s with `dry_run=1` — nothing was
saved. Identifying values (the submission id, title, abstract, authors, topics, the PDF's hash, the
timestamps) are replaced with fakes; HotCRP's keys, value types, statuses and message texts are
verbatim.

| file              | request                                                                                                                                                   | HTTP |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---: |
| `get-paper.json`  | `GET /api/paper?p=<id>&word_limit=hard` with a token                                                                                                      |  200 |
| `get-noauth.json` | the same without a token                                                                                                                                  |  401 |
| `post-dot.json`   | `POST /api/paper?p=<id>&dry_run=1`, PDF part named `paper.pdf`, `content_file` the same — PHP renames the field to `paper_pdf`, so HotCRP finds no upload |  200 |
| `post-ok.json`    | the same with the part and `content_file` named `paperlint_pdf`                                                                                           |  200 |

To re-record: run the same four requests with `curl` against a HotCRP site where you have a
submission and a token (`Authorization: bearer $HOTCRP_TOKEN`), always with `dry_run=1` on a `POST`,
save each body, then replace every identifying value with a fake of the same type before committing.
These files ship in the npm package with the rest of `src/`, like the tests beside them.

## The deadlines pages

`deadlines-<site>.html` are five live sites' `GET /deadlines` pages and one site that does not exist,
recorded whole on 2026-10-05 (`curl`, no account): the page is public and carries no personal data,
so nothing is replaced. `deadlines.test.ts` parses each through the adapter's real parser; the
expected values were read off the pages' text by hand first. `/api/deadlines` on the same sites
answers 401 «Missing credentials», so the HTML page is the source.

| file                      | site                  | HTTP | what it shows                                                      |
| ------------------------- | --------------------- | ---: | ------------------------------------------------------------------ |
| `deadlines-msr2027.html`  | msr2027.hotcrp.com    |  200 | submission and resubmission; the resubmission only in the list     |
| `deadlines-aidc26.html`   | aidc.submit.acsac.org |  200 | submission, and a final-version deadline only in the status object |
| `deadlines-sosp26.html`   | sosp26.hotcrp.com     |  200 | registration, submission, a late resubmission, final version       |
| `deadlines-icse2027.html` | icse2027.hotcrp.com   |  200 | a round that is not open (`"open":false`); dates printed as AoE    |
| `deadlines-fse2027.html`  | fse2027.hotcrp.com    |  200 | one submission deadline printed as AoE                             |
| `deadlines-nosuch.html`   | acsac2026.hotcrp.com  |  404 | «No such conference»                                               |

To re-record: `curl -sS -D - -o deadlines-<site>.html https://<site>/deadlines`.
