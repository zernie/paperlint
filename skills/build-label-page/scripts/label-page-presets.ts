/**
 * PRESETS: named, opt-in words for one narrow use of the generic content blocks. An items.json picks
 * one by name (`"preset": "linter-config-witness"`); the preset turns its own compact card fields into
 * the generic blocks and supplies the page's `labels`, and the items file's own `labels` override
 * them. The core and the page know only the blocks: every word below stays in this file.
 */
import { z } from "zod";

/** A preset's result: the config in the generic shape, or why it cannot be made. */
export type Preset =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly message: string };

// ── linter-config-witness: two linter configs of one requirement disagree on a line of code ──────
const LINE = z.strictObject({
  n: z.int(),
  text: z.string(),
  mark: z.boolean(),
});
const EXAMPLE = z.strictObject({
  file: z.string().min(1),
  url: z.url().optional(),
  lines: z.array(LINE).min(1),
  message: z.string().min(1),
  caught_by: z.enum(["a", "b"]),
});
const EXPLANATION = z
  .strictObject({
    source: z.enum([
      "ruff rule",
      "eslint docs",
      "plugin docs",
      "config message",
      "none",
    ]),
    what: z.string().min(1).optional(),
    why: z.string().min(1).optional(),
    example_bad: z.string().min(1).optional(),
    example_good: z.string().min(1).optional(),
    url: z.url().optional(),
  })
  .refine((x) => x.source === "none" || x.what !== undefined, {
    message: "`what` is required unless `source` is 'none'",
    path: ["what"],
  });
const RULE = z.strictObject({
  linter: z.string().min(1),
  id: z.string().min(1),
  explanation: EXPLANATION,
});
const SETTING = z.strictObject({
  key: z.string().regex(/^(files|ignores|rule|option:\S+)$/u),
  raw: z.string().min(1),
  plain: z.string().min(1),
  matches_example: z.boolean().nullable().optional(),
});
const LINTER_CARD = z.looseObject({
  example: EXAMPLE,
  rules: z.array(RULE).min(1),
  more_like_this: z
    .strictObject({ count: z.int(), files: z.array(z.string()) })
    .optional(),
  details: z.strictObject({
    a: z.array(SETTING).min(1),
    b: z.array(SETTING).min(1),
  }),
});
type LinterCard = z.infer<typeof LINTER_CARD>;
type Setting = z.infer<typeof SETTING>;

const LINTER_LABELS = {
  place: "Card {n} of {total}",
  body: "Requirement",
  line: "Where this requirement comes from (the project's rules file)",
  repeat: "Card {index} of {of} for this requirement",
  practice_example: "Example of this answer, about other code: ",
};
const KEY_LABEL: Readonly<Record<string, string>> = {
  files: "Checks files",
  ignores: "Leaves out",
  rule: "Rule",
};
const DOCS_NOTE =
  "The flagged/allowed examples are the docs' own, with the docs' own settings, not this project's.";

/** A rule as its docs explain it, as a reference entry. */
const ruleEntry = (r: LinterCard["rules"][number]) => {
  const x = r.explanation;
  return {
    label: "Rule",
    title: `${r.linter} \`${r.id}\``,
    fields: [
      x.source === "none"
        ? { style: "note", text: "No official explanation for this rule." }
        : {
            ...(x.source === "config message"
              ? { label: "The config's own message" }
              : {}),
            text: String(x.what),
          },
      ...(x.why === undefined ? [] : [{ label: "Why", text: x.why }]),
      ...(x.example_bad === undefined && x.example_good === undefined
        ? []
        : [{ style: "note", text: DOCS_NOTE }]),
      ...(x.example_bad === undefined
        ? []
        : [{ label: "Flagged", style: "code", text: x.example_bad }]),
      ...(x.example_good === undefined
        ? []
        : [{ label: "Allowed", style: "code", text: x.example_good }]),
    ],
    ...(x.url === undefined ? {} : { url: x.url, url_label: "Rule docs" }),
  };
};
/** Each glob or option on its own row: differences first (A only, B only), what both share last. */
const settingRows = (d: LinterCard["details"]) => {
  const same = (r: Setting, s: Setting) => r.key === s.key && r.raw === s.raw;
  const onlyIn = (xs: readonly Setting[], ys: readonly Setting[]) =>
    xs.filter((r) => !ys.some((s) => same(r, s)));
  const rows: readonly (readonly [Setting, string])[] = [
    ...onlyIn(d.a, d.b).map((r) => [r, "A only"] as const),
    ...onlyIn(d.b, d.a).map((r) => [r, "B only"] as const),
    ...d.a
      .filter((r) => d.b.some((s) => same(r, s)))
      .map((r) => [r, "A and B"] as const),
  ];
  return rows.map(([r, side]) => ({
    label: `${side} · ${KEY_LABEL[r.key] ?? `Option ${r.key.replace(/^option:/u, "")}`}`,
    value: r.raw,
    plain: r.plain,
    ...(r.matches_example === true
      ? { mark: { tone: "yes", text: "✓ matches this file" } }
      : r.matches_example === false
        ? { mark: { tone: "no", text: "✗ does not match this file" } }
        : {}),
  }));
};
/** The files like this one, as a folded list; none when there are none. */
const moreList = (more: LinterCard["more_like_this"]) =>
  more === undefined || more.count === 0
    ? {}
    : {
        more: {
          summary: `${String(more.count)} more file(s) with the same situation`,
          items: more.files.map((f) => `\`${f}\``),
          ...(more.count > more.files.length
            ? { rest: `and ${String(more.count - more.files.length)} more` }
            : {}),
        },
      };
/** One card in the generic blocks. */
function linterCard(card: LinterCard): Record<string, unknown> {
  const { example: ex, rules, more_like_this: more, details, ...rest } = card;
  const by = ex.caught_by === "a" ? ["A", "B"] : ["B", "A"];
  return {
    ...rest,
    excerpt: {
      file: ex.file,
      ...(ex.url === undefined ? {} : { url: ex.url }),
      lines: ex.lines,
      caption: `The linter says: ${ex.message}`,
    },
    references: {
      summary:
        rules.length > 1
          ? "What the linter rules do (official docs)"
          : "What the linter rule does (official docs)",
      entries: rules.map(ruleEntry),
    },
    ...moreList(more),
    table: {
      summary: "Settings behind this card",
      note: `Setting ${String(by[0])} flags the example line; setting ${String(by[1])} passes it.`,
      rows: settingRows(details),
    },
  };
}

const CONFIG = z.looseObject({
  preset: z.string(),
  labels: z.record(z.string(), z.string()).optional(),
  practice: z.array(z.unknown()),
  items: z.array(z.unknown()),
});
const PRESETS: Readonly<
  Record<
    string,
    {
      readonly labels: Readonly<Record<string, string>>;
      readonly card: (c: LinterCard) => Record<string, unknown>;
      readonly schema: typeof LINTER_CARD;
    }
  >
> = {
  "linter-config-witness": {
    labels: LINTER_LABELS,
    card: linterCard,
    schema: LINTER_CARD,
  },
};

/** The first problem zod found, as the build's refusals read: the path, then what is wrong. */
const firstIssue = (where: string, e: z.ZodError): string => {
  const issue = e.issues[0];
  const path = (issue?.path ?? [])
    .map((p) => (typeof p === "number" ? `[${String(p)}]` : `.${String(p)}`))
    .join("");
  return `${where}${path}: ${String(issue?.message)}`;
};

/** Every card through the preset, practice first, each refused by its path. */
const mapCards = (
  preset: (typeof PRESETS)[string],
  practice: readonly unknown[],
  items: readonly unknown[],
): readonly Preset[] =>
  [
    ...practice.map((c, n) => [`practice[${String(n)}]`, c] as const),
    ...items.map((c, n) => [`items[${String(n)}]`, c] as const),
  ].map(([at, c]) => {
    const r = preset.schema.safeParse(c);
    return r.success
      ? { ok: true, value: preset.card(r.data) }
      : { ok: false, message: firstIssue(at, r.error) };
  });
/** The config with its preset applied; a config without `preset` comes back as it was. */
export function applyPreset(raw: unknown): Preset {
  const cfg = CONFIG.safeParse(raw);
  if (!cfg.success) return { ok: true, value: raw };
  const { preset: name, labels, practice, items, ...rest } = cfg.data;
  const preset = PRESETS[name];
  if (preset === undefined)
    return {
      ok: false,
      message: `preset: '${name}' is not a preset (${Object.keys(PRESETS).join(", ")})`,
    };
  const cards = mapCards(preset, practice, items);
  const bad = cards.find((c) => !c.ok);
  if (bad !== undefined) return bad;
  const made = cards.flatMap((c) => (c.ok ? [c.value] : []));
  return {
    ok: true,
    value: {
      ...rest,
      labels: { ...preset.labels, ...labels },
      practice: made.slice(0, practice.length),
      items: made.slice(practice.length),
    },
  };
}
