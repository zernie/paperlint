/**
 * Every shipped preset as `shippedVenueNames` and `otherVenues` name it: its label and the year of
 * its id (null for a template family), in id order. The ONE hand-kept list of what ships, so a new
 * edition is one line here (the add-venue skill, step 7) and the tests that pin the set derive from it.
 */
export const SHIPPED_VENUES: readonly (readonly [string, number | null])[] = [
  ["AAAI", 2027],
  ["aaai-press", null],
  ["acl-latex", null],
  ["acm-acmsmall", null],
  ["acm-sigconf", null],
  ["ACSAC", 2026],
  ["AGENT", 2027],
  ["AgenticDev", 2026],
  ["AGENTVERIFY", 2027],
  ["AIDC", 2026],
  ["AISec", 2026],
  ["ASE", 2026],
  ["ACM CCS", 2026],
  ["EMNLP", 2026],
  ["FSE", 2027],
  ["ICML", 2027],
  ["icml-style", null],
  ["ICSE", 2027],
  ["ICSE", 2028],
  ["ieee-conference", null],
  ["LangCode", 2027],
  ["MSR", 2027],
  ["NAACL", 2027],
  ["NeurIPS", 2026],
  ["neurips-style", null],
  ["NLBSE", 2027],
  ["REALM", 2026],
  ["IEEE S&P", 2027],
];

/** The shipped presets without the ones labelled `left`, as `[label, year]`. */
export const shippedVenuesExcept = (
  ...left: readonly string[]
): readonly (readonly [string, number | null])[] =>
  SHIPPED_VENUES.filter(([label]) => !left.includes(label));
