/**
 * `corpus/licence`'s judgement of one venue corpus (docs/design/venue-corpus.md, decisions 3 and 4;
 * docs/rules/corpus/licence.md): whether the licence of each copy permits keeping each kind it
 * stores. Pure: the record, already parsed by the codec, and the one setting in; the findings out.
 * What a licence permits is the table in `licence.ts`, asked here and never copied.
 */
import { storedAt } from "./corpus-record.ts";
import {
  permits,
  type LicenceSettings,
  type Permission,
  type StoredKind,
} from "./licence.ts";
import type { RecordPath, VenueCorpus } from "./venue-corpus.ts";

/** What stands against storing one kind of one copy: any permission but the one that allows it. */
export type Refusal = Exclude<Permission, { readonly kind: "permitted" }>;

/** One kind of one copy that its licence does not permit, with `at`, the copy's `stored` in `papers.json`. */
export interface LicenceFinding {
  readonly at: RecordPath;
  readonly key: string;
  readonly licence: string;
  readonly stored: StoredKind;
  readonly refusal: Refusal;
}

/** Every stored kind of every copy that its licence does not permit, in the record's order. */
export const judgeLicences = (
  corpus: VenueCorpus,
  settings: Readonly<LicenceSettings>,
): readonly LicenceFinding[] =>
  corpus.papers.flatMap((p, paper) =>
    p.copies.flatMap((c, copy) =>
      c.stored.flatMap((stored) => {
        const refusal = permits(c.licence.id, stored, settings);
        return refusal.kind === "permitted"
          ? []
          : [
              {
                at: storedAt(paper, [copy]),
                key: p.key,
                licence: c.licence.id,
                stored,
                refusal,
              },
            ];
      }),
    ),
  );

const FILE: Readonly<Record<StoredKind, string>> = {
  pdf: "pdf/<key>.pdf",
  text: "text/<key>.txt",
};

/** The text of a finding: what is wrong, then what to do. */
export function licenceMessage(f: LicenceFinding): string {
  const what = `a copy of \`${f.key}\` stores \`${f.stored}\` (\`${FILE[f.stored]}\`)`;
  const remove = `remove the file and \`"${f.stored}"\` from that copy's \`stored\`, and keep the paper's ids`;
  switch (f.refusal.kind) {
    case "not-read":
      return `${what}, and no licence was read for that copy (\`NOASSERTION\`). What to do: record the licence and where it was read (\`licence.id\`, \`read_from\`, \`read_on\`), or ${remove}`;
    case "unlisted":
      return `${what} under \`${f.refusal.id}\`, and the licence table does not list that id, so it permits nothing. What to do: correct the id if it is misspelt; otherwise ${remove}`;
    case "forbidden":
      return `${what} under \`${f.licence}\`, which does not permit it: ${f.refusal.why}. What to do: ${remove}`;
    case "non-commercial-only":
      return `${what} under \`${f.licence}\`, which permits it only in a non-commercial project, and this one has not declared itself one. What to do: if it is one, set \`"corpus/licence": ["warn", { "nonCommercial": true }]\` in the root \`paperlint.json\`; otherwise ${remove}`;
  }
}
