/**
 * Rule 10's mechanical half: nothing outside the port may name a file by WHERE IT IS
 * INSTALLED.
 *
 * The class this exists for has broken this repository five times, silently every time, and
 * the detail is in `docs/incidents.md`. What matters for the code below is the shape of the
 * defect: a path that is correct in one install channel and absent in another. There are
 * three channels and each has its own give-away prefix — the consumer's skills directory
 * (the symlink channel), the package directory npm creates, and the plugin cache. A literal
 * naming any of them is a bet on the channel, made by a file that has no business knowing
 * which channel it is in.
 *
 * WHY TWO RULES RATHER THAN ONE. The literals live in two different languages: markdown, in
 * a skill's own prose and in its `allowed-tools` frontmatter, and JavaScript, in the modules
 * this package ships. A single rule cannot visit both — ESLint hands a rule the AST of
 * whatever language the file is, and the node types share nothing. So the detector is shared
 * and the visitors are not.
 *
 * WHY NOT A GREP OVER THE FILE. In markdown the give-away sits inside a fenced block, inline
 * code, or a YAML frontmatter value, and a text scan cannot tell those from a sentence that
 * merely discusses the hazard — which is exactly what `CLAUDE.md` and `docs/incidents.md` do.
 * The parser can: this rule sees nodes, and it is pointed only at skills.
 */

// Each entry is a prefix that only makes sense in ONE install channel.
const CHANNEL_PREFIXES = [
  ".claude/skills/", // the consumer symlinks the package's skills to here
  "node_modules/", // npm's copy
  ".claude/plugins/", // the plugin cache
  "plugins/cache/", // the same cache, named from further up
];

/** The first channel prefix appearing in `s`, or null. Plain substring: a path IS a string. */
function channelPrefixIn(s) {
  if (typeof s !== "string") return null;
  for (const p of CHANNEL_PREFIXES) if (s.includes(p)) return p;
  return null;
}

// The port, named by its path INSIDE this package — the same in every channel, so naming it
// is not the bet this rule forbids. One constant, because the advice below was once a file
// that never existed (#67) and read fine for a week: the harness now requires it on disk.
const PORT = "skills/paper-pipeline/scripts/consumer.mjs";

const MESSAGES = {
  installPath:
    "This names a file by where it is INSTALLED ('{{prefix}}'), so it resolves in one " +
    "delivery channel and does not exist in another. Rule 10: every answer to *where* comes " +
    `from the port, ${PORT}. In a skill, use the substitution the harness performs ` +
    "(CLAUDE_SKILL_DIR / CLAUDE_PLUGIN_ROOT); in a module, ask the port.",
};

/** Markdown: a skill's own prose, its fenced commands, and its YAML frontmatter. */
const mdInstallPath = {
  meta: {
    type: "problem",
    docs: {
      description:
        "a skill must not name its scripts by an install-specific path — rule 10, the port owns where",
    },
    schema: [],
    messages: MESSAGES,
  },
  create(context) {
    const check = (node) => {
      const prefix = channelPrefixIn(node.value);
      if (prefix)
        context.report({ node, messageId: "installPath", data: { prefix } });
    };
    // `yaml` is the frontmatter block, which is where `allowed-tools` lives; the other three
    // are the ways a command can appear in the body.
    return { yaml: check, code: check, inlineCode: check, text: check };
  },
};

/** JavaScript: the modules this package ships. */
const jsInstallPath = {
  meta: {
    type: "problem",
    docs: {
      description:
        "a shipped module must not carry an install-specific path literal — rule 10, the port owns where",
    },
    schema: [],
    messages: MESSAGES,
  },
  create(context) {
    const report = (node, prefix) =>
      context.report({ node, messageId: "installPath", data: { prefix } });
    return {
      Literal(node) {
        const prefix = channelPrefixIn(node.value);
        if (prefix) report(node, prefix);
      },
      // A template literal's static parts are just as much a path as a plain string; its
      // interpolations are not our business, which is why the quasis are read one by one.
      TemplateElement(node) {
        const prefix = channelPrefixIn(node.value?.cooked ?? node.value?.raw);
        if (prefix) report(node, prefix);
      },
    };
  },
};

export default {
  rules: { "md-install-path": mdInstallPath, "js-install-path": jsInstallPath },
};
export { channelPrefixIn, CHANNEL_PREFIXES, PORT };
