# Replacing the artifact on OSF

For a double-blind venue without a supplementary upload, the reproduction artifact is often hosted
on an [OSF](https://osf.io) project behind an anonymized view-only link (creating the project and
the link: `submit-paper`, step 2). This page replaces or adds a file on that project through the
[OSF API](https://developer.osf.io/), when the web interface is inconvenient.
`paperlint artifact upload --to osf` does the same and writes the upload record
([`artifact-upload.md`](artifact-upload.md)); this page is the manual way.

## The token

Make a personal access token at `osf.io/settings/tokens` with the scope `osf.full_write` (a
read-only token cannot write); it is shown once. Set it in your environment as `OSF_TOKEN` for the
lines below (`paperlint artifact upload` reads `OSF_TOKEN_OSF_IO` instead). Never
commit it, print it or write it into a file, and delete it on the same page after the upload.

## Replace a file

`$NODE` is the project's guid: the five characters after `osf.io/` in the paper's Availability line.
The `?view_only=…` part is a separate anonymized link; with the owner's token you address the
project by its guid.

```bash
set +x; AUTH="Authorization: Bearer $OSF_TOKEN"; NODE=<guid>; ZIP=artifact.zip
# 1. the token works: prints your name
curl -g -s --retry 3 -H "$AUTH" https://api.osf.io/v2/users/me/ \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['attributes']['full_name'])"
# 2. the files: each one's links.upload is where a new version goes
curl -g -s --retry 3 -H "$AUTH" "https://api.osf.io/v2/nodes/$NODE/files/osfstorage/" > files.json
#    UP = links.upload of the entry whose attributes.name is the file to replace;
#    to add a new file, use the folder's upload link instead
# 3. a new version: PUT the bytes
curl -g -s --retry 3 -H "$AUTH" -X PUT --data-binary @"$ZIP" "${UP}?kind=file" -o up.json
#    success: HTTP 200, data.attributes.extra.version went up, the size matches
# 4. verify: list the files again; extra.hashes.md5 must equal `md5sum "$ZIP"`
```

The md5 OSF stores is the proof: when it equals the local file's, the upload landed, even when a
download back fails. An artifact kept unpacked (`README.md`, `reproduce.py`, `data/…`) is replaced
file by file, each through its own `links.upload`.

## Known failures

- **Square brackets in a URL** (`?page[size]=50`) make curl glob and fail with an empty body and no
  status. Pass `-g`, or drop the parameter.
- **An empty answer.** Behind some proxies a call returns 0 bytes now and then: retry
  (`--retry 3`, or loop until the body is JSON), and verify by the API's metadata rather than by
  downloading the file back.
- **A token in a shell trace.** Keep `set +x` and hold the token only in a variable.

## After

- The paper's Availability `\url{}` still points at the same project: the guid does not change.
- Delete the token at `osf.io/settings/tokens`.

What the artifact must carry before it is zipped (each study's plan, its decision file, the
regenerated index): [the artifact checklist](../skills/paper-pipeline/references/artifact-checklist.md).
