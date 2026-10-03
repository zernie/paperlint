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
