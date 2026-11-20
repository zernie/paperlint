# OSF cassette

Answers to the requests `paperlint artifact upload|show` sends, replayed by `host.test.ts` from a
local server on 127.0.0.1 and parsed by the adapter's real schemas: no test reaches OSF.

Recorded from the live API on 2026-11-21 without a token, from a public project (`curl`, read-only).
Identifying values are replaced with fakes of the same type — the project's guid (`abcde`), the
file's id, guid, name, size, dates and hashes (the hashes are those of the 15 bytes
`artifact bytes\n`, which the tests upload); OSF's keys, value types and statuses are verbatim.

| file               | request                                                                                    | HTTP | how                                                                                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------ | ---: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `get-file.json`    | `GET https://api.osf.io/v2/files/<id>/`                                                    |  200 | recorded                                                                                                                                                           |
| `get-listing.json` | `GET https://api.osf.io/v2/nodes/<guid>/files/osfstorage/?filter[name]=<name>`             |  200 | recorded; the file's `guid` is `null`, as OSF answered for it                                                                                                      |
| `get-missing.json` | `GET https://api.osf.io/v2/files/000000000000000000000000/`                                |  404 | recorded verbatim                                                                                                                                                  |
| `put-new.json`     | `PUT https://files.osf.io/v1/resources/<guid>/providers/osfstorage/?kind=file&name=<name>` |  201 | **not recorded** (it needs a token and writes): written from WaterButler's source — `{"data": <entity>}`, `id` = provider + path, `path` = `/<id>`, `extra.hashes` |

To re-record the three reads: `curl -sS -g -o <file> '<url>'` against a public project, then fake
every identifying value. Recording `put-new.json` needs a project of your own and a token with
`osf.full_write`; replace its values the same way.
