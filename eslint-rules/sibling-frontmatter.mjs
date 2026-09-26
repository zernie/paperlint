/**
 * `sibling/frontmatter` — a sibling card (`<paper>/siblings/*.md`, written by the
 * `analyze-sibling-paper` skill) says in its frontmatter how much of the competing paper was READ:
 * `read: full | abstract | none`. A verdict like "not a scoop" means something different when only
 * the abstract was read, and a card that does not say is a finding.
 *
 * The field replaces a convention (a bold `**Read:**` line in the prose) and, before 3.0.0, a
 * project setting (`docFields`) whose one real use was this field. The package writes the cards,
 * so it ships the schema: `sibling-frontmatter.schema.json`. Same mechanism as
 * `review/frontmatter`.
 */
import { frontmatterRule } from "./review-frontmatter.mjs";

export default {
  rules: {
    frontmatter: frontmatterRule(
      new URL("./sibling-frontmatter.schema.json", import.meta.url),
      "a sibling card's frontmatter records how much of the competing paper was read (`read: full | abstract | none`)",
    ),
  },
};
