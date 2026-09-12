// Compiled to SKILL.md by `vigiles compile`. Edit THIS file, never the markdown.
//
// Adopted 2026-08-17 (batch 3). Body carried over VERBATIM so the compiled diff shows
// only what the compiler adds. No `disallowedTools` fence yet — the field landed on
// `SkillSpec` in vigiles branch `claude/skill-disallowed-tools` and is not in a release
// this repo installs, so writing one here would not compile.
import { experimental_skill } from "vigiles/spec";

export default experimental_skill({
  name: "osf-artifact-upload",
  description: "Upload or replace a paper's reproduction artifact file on an OSF project via the OSF API — for anonymized/view-only artifacts hosted for peer review (AISec/AgenticDev etc.). Use when a paper's OSF-hosted artifact needs a file added or a new version pushed (e.g. after fixing the artifact README or regenerating artifact.zip), and the OSF web UI is inconvenient. Composes with submit-paper / submit-paper-<venue>.",
  tools: ["Read", "Write", "Grep", "Glob", "Bash"],
  body: `
# osf-artifact-upload — push/replace a file on an OSF project via API

Verified working 2026-07-18 (replaced \`artifact.zip\` on the node of a real submission's artifact).

## Prereq — an OSF personal access token
- Create at **osf.io/settings/tokens** → scope **\`osf.full_write\`** (read-only cannot write). Shown once.
- Put it in the env as \`OSF_TOKEN\` for the session, OR the user pastes it. **NEVER commit it, never echo it,
  never write it into a file or the skill.** Remind the user to **revoke it** after the upload.
- ⚠️ Note: a token stored as a gzipped/base64 blob in some other env var may be **blocked from decoding by
  the auto-mode classifier** (correctly). Don't fight it — ask for a fresh \`osf.full_write\` token instead.

## Gotchas learned (bake these in)
- **curl globbing:** OSF API URLs with \`[ ]\` (e.g. \`?page[size]=50\`) make curl fail silently (empty body,
  no status). Always use **\`curl -g\`** (disable globbing) or drop the bracketed param.
- **Flaky proxy:** calls intermittently return 0 bytes / empty. **Retry** (loop until valid JSON;
  \`--retry 3\`). Verify by API metadata, not only by the waterbutler download (download-back flakes most).
- **CA bundle:** in this env, add \`--cacert /root/.ccr/ca-bundle.crt\` to every curl.
- **Node GUID:** the \`osf.io/<guid>\` in the paper's Availability (a five-character guid, e.g. \`ab12c\`) IS the node id; the
  \`?view_only=…\` is a separate anonymized link. With the owner token you address the node by its guid.
- **\`set +x\`** and keep the token only in a shell variable — never in printed output.

## Recipe (all curl; \`$T\`=token, \`$CA\`=/root/.ccr/ca-bundle.crt, \`$NODE\`=guid, \`$ZIP\`=local file)
\`\`\`bash
set +x; CA=/root/.ccr/ca-bundle.crt; T="$OSF_TOKEN"; AUTH="Authorization: Bearer $T"; NODE=<guid>   # the node from YOUR paper's Availability line
# 1. verify auth (expect HTTP 200 + your name)
curl -g -s --retry 3 --cacert $CA -H "$AUTH" https://api.osf.io/v2/users/me/ \\
  | python3 -c "import sys,json;d=json.load(sys.stdin);print('auth:',d['data']['attributes']['full_name'])"
# 2. list osfstorage files → each file's links.upload is its waterbutler URL (for a NEW VERSION)
curl -g -s --retry 3 --cacert $CA -H "$AUTH" "https://api.osf.io/v2/nodes/$NODE/files/osfstorage/" >/tmp/f.json
#    parse: find the target file's attributes.name==X → f['links']['upload']  (call it $UP)
#    to ADD a new file instead: use the folder's upload link from /v2/nodes/$NODE/files/ (osfstorage provider)
# 3. push new version (PUT the bytes; append kind=file)
curl -g -s --retry 3 --cacert $CA -H "$AUTH" -X PUT --data-binary @"$ZIP" "\${UP}?kind=file" -o /tmp/up.json
#    success = HTTP 200 + data.attributes.extra.version incremented + size matches
# 4. VERIFY by API metadata: re-list files, confirm attributes.size and extra.hashes.md5 == md5sum of $ZIP
\`\`\`
Verification that actually holds: **OSF-stored md5 == \`md5sum $ZIP\`**. The upload response also returns the
md5; matching it to the local file is proof even when the download-back call flakes.

## After
- Confirm the paper's Availability \`\\url{}\` still points at the same node (it does — same guid).
- Tell the user to **revoke the token** (osf.io/settings/tokens → Delete).
- If the artifact is stored unpacked (README.md, reproduce.py, data/…) rather than as a zip, replace each
  stale file the same way (each has its own \`links.upload\`).`,
});
