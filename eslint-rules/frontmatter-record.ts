/**
 * A markdown file's YAML frontmatter as data — the one reading every rule over a frontmatter uses
 * (`review/frontmatter`, `review/findings-closed`).
 *
 * YAML is read with js-yaml's CORE schema, which leaves `2026-09-20` a string. The default schema
 * turns it into a Date, and a schema asking for `"type": "string"` would then reject a date the
 * author wrote correctly.
 */
import { CORE_SCHEMA, load } from "js-yaml";
import { z } from "zod";

/**
 * What a parser failure says about itself. js-yaml's `YAMLException` carries a `reason`; anything
 * else thrown may carry a `message`, or be a bare value that says nothing.
 */
const Thrown = z
  .object({
    reason: z.string().optional().catch(undefined),
    message: z.string().optional().catch(undefined),
  })
  .catch({});

/** A frontmatter block read as YAML: its record, or why it does not parse. */
export type Frontmatter =
  | { readonly ok: true; readonly data: unknown }
  | { readonly ok: false; readonly why: string };

/**
 * A frontmatter block as data — the one reading every rule over a frontmatter uses. An empty block
 * is `{}`; a block that does not parse says why.
 */
export function parseFrontmatter(text: string | undefined): Frontmatter {
  try {
    return { ok: true, data: load(text ?? "", { schema: CORE_SCHEMA }) ?? {} };
  } catch (e) {
    const { reason, message } = Thrown.parse(e);
    return { ok: false, why: reason ?? message ?? "unparseable" };
  }
}
