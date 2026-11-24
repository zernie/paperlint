/**
 * `corpus/licence`'s judgement of one venue corpus (docs/design/venue-corpus.md, decisions 3 and 4;
 * docs/rules/corpus/licence.md): whether the licence of each copy permits keeping each kind it
 * stores. Pure: the record, already parsed by the codec, and the one setting in; the findings out.
 * What a licence permits is the table in `licence.ts`, asked here and never copied.
 */
import { groupBy } from "remeda";
import { storedAt } from "./corpus-record.ts";
import {
  permits,
  type LicenceSettings,
  type Permission,
  type StoredKind,
} from "./licence.ts";
import type { Copy, RecordPath, VenueCorpus } from "./venue-corpus.ts";

/** What stands against storing one kind of one copy: any permission but the one that allows it. */
export type Refusal = Exclude<Permission, { readonly kind: "permitted" }>;

/**
 * The kinds of one copy that one refusal stands against, with `at`, the copy's `stored` in `papers.json`.
 * A copy whose kinds are refused for the same reason is one finding naming them all; ND, which
 * refuses one kind and not the other, gives one finding for that kind.
 */
export interface LicenceFinding {
  readonly at: RecordPath;
  readonly key: string;
  readonly licence: string;
  readonly stored: readonly [StoredKind, ...StoredKind[]];
  readonly refusal: Refusal;
}

/** One stored kind of a copy and what refuses it. */
interface Refused {
  readonly stored: StoredKind;
  readonly refusal: Refusal;
}

/** The stored kinds of `copy` its licence refuses, in its `stored` order. */
const refusedKinds = (
  copy: Readonly<Copy>,
  settings: Readonly<LicenceSettings>,
): readonly Refused[] =>
  copy.stored.flatMap((stored) => {
    const refusal = permits(copy.licence.id, stored, settings);
    return refusal.kind === "permitted" ? [] : [{ stored, refusal }];
  });

/** The refusals of one copy, one per reason (two refusals that print the same message are one), each with its kinds. */
const byReason = (
  refused: readonly Refused[],
): readonly Pick<LicenceFinding, "stored" | "refusal">[] =>
  Object.values(groupBy(refused, (r) => JSON.stringify(r.refusal))).map(
    ([first, ...rest]) => ({
      stored: [first.stored, ...rest.map((r) => r.stored)],
      refusal: first.refusal,
    }),
  );

/** Every refusal of every copy, with the stored kinds it stands against, in the record's order. */
export const judgeLicences = (
  corpus: VenueCorpus,
  settings: Readonly<LicenceSettings>,
): readonly LicenceFinding[] =>
  corpus.papers.flatMap((p, paper) =>
    p.copies.flatMap((c, copy) =>
      byReason(refusedKinds(c, settings)).map((r) => ({
        at: storedAt(paper, [copy]),
        key: p.key,
        licence: c.licence.id,
        ...r,
      })),
    ),
  );

const FILE: Readonly<Record<StoredKind, string>> = {
  pdf: "pdf/<key>.pdf",
  text: "text/<key>.txt",
};

/** The text of a finding: what is wrong, then what to do. */
export function licenceMessage(f: LicenceFinding): string {
  const kinds = f.stored.map((k) => `\`${k}\``).join(" and ");
  const files = f.stored.map((k) => `\`${FILE[k]}\``).join(", ");
  const quoted = f.stored.map((k) => `\`"${k}"\``).join(" and ");
  const it = f.stored.length === 1 ? "it" : "them";
  const what = `a copy of \`${f.key}\` stores ${kinds} (${files})`;
  const remove = `remove ${f.stored.length === 1 ? "the file" : "the files"} and ${quoted} from that copy's \`stored\`, and keep the paper's ids`;
  switch (f.refusal.kind) {
    case "not-read":
      return `${what}, and no licence was read for that copy (\`NOASSERTION\`). What to do: record the licence and where it was read (\`licence.id\`, \`read_from\`, \`read_on\`), or ${remove}`;
    case "unlisted":
      return `${what} under \`${f.refusal.id}\`, and the licence table does not list that id, so it permits nothing. What to do: correct the id if it is misspelt; otherwise ${remove}`;
    case "forbidden":
      return `${what} under \`${f.licence}\`, which does not permit ${it}: ${f.refusal.why}. What to do: ${remove}`;
    case "non-commercial-only":
      return `${what} under \`${f.licence}\`, which permits ${it} only in a non-commercial project, and this one has not declared itself one. What to do: if it is one, set \`"corpus/licence": ["warn", { "nonCommercial": true }]\` in the root \`paperlint.json\`; otherwise ${remove}`;
  }
}
