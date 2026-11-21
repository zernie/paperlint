/**
 * `paperlint artifact record|upload|show` — write and read the upload record of a paper's
 * reproduction artifact (`src/domain/artifact-upload.ts`, docs/artifact-upload.md). All optional:
 * `artifact/upload-current` reads the record whoever wrote it.
 *
 *   record   any host, no network: hash the zip, snapshot the paper's numbers, write the record
 *   upload   the optional wrapper over a host's adapter (`--to osf`): a DRY RUN unless `--save`;
 *            with it, upload, read the host's hashes back, write the same record
 *   show     the record, and — where the host's adapter reads hashes — `match yes|no` against it
 *
 * The numbers file is `--numbers`, else the `numbers` option of `artifact/upload-current` in the
 * paper's own `paperlint.json`; the record's path is that rule's `record` option, else the default.
 *
 * 🔴 THE TOKEN IS AN INPUT, AND ONLY AN INPUT: read from the environment through `env`, handed to the
 * adapter, never printed. Its variable is named the way `submission` names a site's
 * (`src/domain/portal-token.ts`); the site-less one is refused by name.
 */
import { basename, resolve } from "node:path";
import { omit } from "remeda";
import { callerPath } from "./caller-path.ts";
import {
  md5Hex,
  parseUploadRecord,
  recordOf,
  RECORD_VERSION,
  uploadRecordText,
  type UploadRecord,
} from "./domain/artifact-upload.ts";
import { lookUpToken } from "./domain/portal-token.ts";
import { err, ok, type Result } from "./domain/result.ts";
import { sha256Hex } from "./domain/sha256.ts";
import type { ArtifactHost, HostedFile } from "./ports/artifact-host.ts";
import {
  printedNumbers,
  uploadOptions,
  type UploadOptions,
  type UploadRuleDeps,
} from "./artifact-upload-rule.ts";

export interface ArtifactInput {
  readonly sub: string | undefined;
  /** The operands after the subcommand: the zip (record, upload), then the paper folder. */
  readonly operands: readonly string[];
  readonly url: string | null;
  readonly host: string | null;
  readonly to: string | null;
  readonly node: string | null;
  readonly numbers: string | null;
  readonly save: boolean;
}

export interface ArtifactDeps extends UploadRuleDeps {
  /** Every host with an adapter, by the name a record and `--to` use. */
  readonly hosts: Readonly<Record<string, ArtifactHost>>;
  readonly env: (name: string) => string | undefined;
  readonly now: () => string;
  readonly cwd: string;
  readonly log: (line: string) => void;
  readonly err: (line: string) => void;
  /** The rule's entry (`[severity, options]`) as lint's config gives it for the paper in `dir`, or undefined. */
  readonly ruleEntry: (dir: string) => Promise<unknown>;
}

const RULE = "artifact/upload-current";

/**
 * The rule's options where lint turns it on for the paper in `dir`, as ESLint computes them for the
 * file the rule runs on (`ruleEntry`), so the commands and lint read one answer whatever shape the settings
 * take; the defaults when the rule is not on there.
 */
export async function paperUploadOptions(
  dir: string,
  deps: Pick<ArtifactDeps, "ruleEntry">,
): Promise<UploadOptions> {
  const entry = await deps.ruleEntry(dir);
  return uploadOptions(Array.isArray(entry) ? entry[1] : undefined);
}

/** What a record is written from: the zip, the paper, the record's path, the numbers now. */
interface Prepared {
  readonly zip: string;
  readonly bytes: Uint8Array;
  readonly paperDir: string;
  readonly recordPath: string;
  readonly numbers: Readonly<Record<string, string>>;
}

/** The numbers file's values for the paper `paperDir`, or the line that says why there are none. */
function numbersOf(
  paperDir: string,
  file: string | null,
  d: ArtifactDeps,
): Result<Readonly<Record<string, string>>, string> {
  if (file === null)
    return err(
      `which file holds the paper's numbers? pass --numbers <file> (relative to the paper), or turn ${RULE} on with its "numbers" option`,
    );
  const p = printedNumbers(paperDir, file, d);
  if (p.ok) return ok(Object.fromEntries(p.value.values));
  return err(
    p.error === "noNumbersFile"
      ? `no numbers file ${file} in ${paperDir}`
      : `the numbers file ${file} defines no macro without arguments (\\newcommand{\\key}{value})`,
  );
}

/** The zip and the paper's numbers, or the line that says why there are none. */
async function prepare(
  i: ArtifactInput,
  d: ArtifactDeps,
): Promise<Result<Prepared, string>> {
  const [zipArg, dirArg] = i.operands;
  if (zipArg === undefined)
    return err(
      `name the uploaded file: paperlint artifact ${String(i.sub)} <zip> …`,
    );
  const zip = resolve(d.cwd, zipArg);
  const bytes = d.files.readBytes(callerPath(zip));
  if (bytes === null) return err(`no file ${zipArg}`);
  const paperDir = resolve(d.cwd, dirArg ?? ".");
  const o = await paperUploadOptions(paperDir, d);
  const numbers = numbersOf(paperDir, i.numbers ?? o.numbers, d);
  if (!numbers.ok) return numbers;
  const recordPath = resolve(paperDir, o.record);
  return ok({ zip, bytes, paperDir, recordPath, numbers: numbers.value });
}

/** Write the record, or say why it is not one (a bad `--url`), and what was written. */
function write(r: UploadRecord, p: Prepared, d: ArtifactDeps): number {
  const valid = recordOf(r);
  if (!valid.ok) {
    d.err(`paperlint artifact: not written — ${valid.error}`);
    return 2;
  }
  d.files.writeAtomic(
    callerPath(p.recordPath),
    new TextEncoder().encode(uploadRecordText(valid.value)),
  );
  d.log(`wrote ${p.recordPath}`);
  d.log(`  ${r.host} ${r.url}`);
  d.log(`  ${r.file} sha256 ${r.sha256 ?? "—"} md5 ${r.md5 ?? "—"}`);
  d.log(
    `  ${String(Object.keys(r.numbers).length)} numbers from the numbers file, as they are now`,
  );
  return 0;
}

/** The record of `p` uploaded to `url` on `host`, now. */
const recordFor = (
  p: Prepared,
  host: string,
  url: string,
  d: ArtifactDeps,
): UploadRecord => ({
  version: RECORD_VERSION,
  host,
  url,
  file: basename(p.zip),
  sha256: sha256Hex(p.bytes),
  md5: md5Hex(p.bytes),
  uploadedAt: d.now(),
  numbers: p.numbers,
});

/** The name of the host whose adapter recognises `url`, else `other`. */
const hostNamed = (url: string, d: ArtifactDeps): string =>
  Object.entries(d.hosts).find(([, h]) => h.targetOf(url) !== null)?.[0] ??
  "other";

async function record(i: ArtifactInput, d: ArtifactDeps): Promise<number> {
  const p = await prepare(i, d);
  if (!p.ok) return fail(p.error, d);
  if (i.url === null) return fail("where is it? pass --url <url>", d);
  return write(
    recordFor(p.value, i.host ?? hostNamed(i.url, d), i.url, d),
    p.value,
    d,
  );
}

/** Say why, and the exit code of a command that could not start. */
const fail = (why: string, d: ArtifactDeps): number => {
  d.err(`paperlint artifact: ${why}`);
  return 2;
};

/** A host's token works wherever the host does: it has no sites to tell apart. */
export const neverSiteOnly = (): boolean => false;

/** The token for `host`, read through `env`; the lines that say how to set it when it is not. */
function tokenFor(
  host: ArtifactHost,
  d: ArtifactDeps,
): Result<string, readonly string[]> {
  const t = lookUpToken(
    {
      variable: host.token.variable,
      shared: null,
      siteOnly: neverSiteOnly,
      siteLess: host.token.siteLess,
    },
    d.env,
  );
  if (t.ok) return ok(t.value.token);
  return err([
    t.error.kind === "site-less"
      ? `${host.token.siteLess} is set but not read: set ${host.token.variable} instead`
      : `no token: ${host.token.variable} is not set`,
    `  1. make one: ${host.token.help}`,
    `  2. set it in your environment — never paste it into a chat: export ${host.token.variable}=<the token>`,
  ]);
}

/** The host `--to` names, if paperlint has an adapter for it that uploads. */
function uploader(
  i: ArtifactInput,
  d: ArtifactDeps,
): Result<ArtifactHost, string> {
  const h = i.to === null ? undefined : d.hosts[i.to];
  return h?.can.upload === true
    ? ok(h)
    : err(
        `name a host paperlint uploads to: --to ${Object.keys(d.hosts).join(" | ")} (for any other host, upload it yourself and run \`paperlint artifact record <zip> --url <url>\`)`,
      );
}

/** An upload ready to go: the host, the zip and numbers, the project, the zip's sha256. */
interface Plan {
  readonly name: string;
  readonly host: ArtifactHost;
  readonly p: Prepared;
  readonly target: string;
  readonly sha: string;
}

/** The upload `i` asks for, printed, or why it cannot be made. */
async function plan(
  i: ArtifactInput,
  d: ArtifactDeps,
): Promise<Result<Plan, string>> {
  const h = uploader(i, d);
  if (!h.ok) return h;
  const p = await prepare(i, d);
  if (!p.ok) return p;
  const old = readRecord(p.value.recordPath, d);
  const target = i.node ?? (old.ok ? h.value.targetOf(old.value.url) : null);
  if (target === null)
    return err("which project? pass --node <id> (the project's id in its url)");
  const sha = sha256Hex(p.value.bytes);
  const name = String(i.to);
  d.log(
    `upload ${basename(p.value.zip)} (${String(p.value.bytes.length)} bytes, sha256 ${sha}) to ${name} project ${target}`,
  );
  d.log(
    `then write ${p.value.recordPath} with the host's hashes and ${String(Object.keys(p.value.numbers).length)} numbers`,
  );
  return ok({ name, host: h.value, p: p.value, target, sha });
}

/** Upload with `token`, check what the host holds, and write the record. */
async function send(x: Plan, token: string, d: ArtifactDeps): Promise<number> {
  const { p } = x;
  const up = await x.host.upload(
    { target: x.target, name: basename(p.zip), bytes: p.bytes },
    token,
  );
  if (!up.ok)
    return fail(`upload failed (${up.error.kind}): ${up.error.detail}`, d);
  if (up.value.sha256 !== null && up.value.sha256 !== x.sha) {
    d.err(
      `paperlint artifact: ${x.name} holds sha256 ${up.value.sha256}, not the ${x.sha} sent; no record written`,
    );
    return 1;
  }
  const r = recordFor(p, x.name, up.value.url, d);
  return write(hostedRecord(r, up.value), p, d);
}

async function upload(i: ArtifactInput, d: ArtifactDeps): Promise<number> {
  const x = await plan(i, d);
  if (!x.ok) return fail(x.error, d);
  const token = tokenFor(x.value.host, d);
  // The person's yes names the project (`submission-confirm`), so `--save` takes it from the command
  // line only, never from the record: the project the yes was given for is the one uploaded to.
  if (i.save && i.node === null)
    return fail(
      `--save uploads only to a project named with --node: run again with --save --node ${x.value.target}`,
      d,
    );
  if (i.save)
    return token.ok
      ? send(x.value, token.value, d)
      : fail(token.error.join("\n"), d);
  d.log(
    token.ok
      ? `token: ${x.value.host.token.variable} is set`
      : token.error.join("\n"),
  );
  d.log(
    `DRY RUN: nothing uploaded, nothing written. Run again with --save --node ${x.value.target} to upload.`,
  );
  return 0;
}

/** The record with the host's own id and hashes, as it read them back. */
const hostedRecord = (r: UploadRecord, f: HostedFile): UploadRecord => {
  const rest = omit(r, ["sha256", "md5"]);
  return {
    ...rest,
    id: f.id,
    ...(f.sha256 === null ? {} : { sha256: f.sha256 }),
    ...(f.md5 === null ? {} : { md5: f.md5 }),
  };
};

/** The record at `path`, or why there is none to read. */
function readRecord(
  path: string,
  d: ArtifactDeps,
): Result<UploadRecord, string> {
  const bytes = d.files.readBytes(callerPath(path));
  if (bytes === null)
    return err(
      `no upload record ${path}: write one with \`paperlint artifact record <zip> --url <url>\``,
    );
  const r = parseUploadRecord(new TextDecoder().decode(bytes));
  return r.ok ? r : err(`the upload record ${path} cannot be read: ${r.error}`);
}

/** Each hash the record and the host both give, and whether they agree. */
const compared = (r: UploadRecord, f: HostedFile, h: ArtifactHost) =>
  h.can.hashes.flatMap((k) => {
    const mine = r[k];
    const theirs = f[k];
    return mine === undefined || theirs === null
      ? []
      : [{ k, theirs, same: mine === theirs }];
  });

/** The host's hashes of the recorded file, against the record's: `match yes|no`; the exit code. */
async function check(
  rec: UploadRecord,
  h: ArtifactHost,
  d: ArtifactDeps,
): Promise<number> {
  const token = tokenFor(h, d);
  const f = await h.read(
    { url: rec.url, file: rec.file, id: rec.id ?? null },
    token.ok ? token.value : null,
  );
  if (!f.ok)
    return fail(
      `could not read the file on ${rec.host} (${f.error.kind}): ${f.error.detail}`,
      d,
    );
  const c = compared(rec, f.value, h);
  c.forEach((x) => {
    d.log(`  host:   ${x.k} ${x.theirs}`);
  });
  if (c.length === 0) {
    d.log("match unknown: the record holds no hash the host gives");
    return 0;
  }
  const yes = c.every((x) => x.same);
  d.log(`match ${yes ? "yes" : "no"}`);
  return yes ? 0 : 1;
}

async function show(i: ArtifactInput, d: ArtifactDeps): Promise<number> {
  const dir = resolve(d.cwd, i.operands[0] ?? ".");
  const r = readRecord(
    resolve(dir, (await paperUploadOptions(dir, d)).record),
    d,
  );
  if (!r.ok) return fail(r.error, d);
  const rec = r.value;
  d.log(`${rec.host} ${rec.url}`);
  d.log(
    `  ${rec.file}, uploaded ${rec.uploadedAt}, ${String(Object.keys(rec.numbers).length)} numbers`,
  );
  d.log(`  record: sha256 ${rec.sha256 ?? "—"} md5 ${rec.md5 ?? "—"}`);
  const h = d.hosts[rec.host];
  if (h !== undefined && h.can.hashes.length > 0) return check(rec, h, d);
  d.log(
    `paperlint cannot read hashes from ${rec.host}: the record's own are above; compare them on the host's page`,
  );
  return 0;
}

/** `paperlint artifact <sub> …`; the exit code. */
export async function runArtifact(
  i: ArtifactInput,
  d: ArtifactDeps,
): Promise<number> {
  if (i.sub === "record") return record(i, d);
  if (i.sub === "upload") return upload(i, d);
  if (i.sub === "show") return show(i, d);
  return fail(
    `${i.sub === undefined ? "no subcommand" : `unknown subcommand ${i.sub}`}: record | upload | show`,
    d,
  );
}
