---
name: planted-clean
allowed-tools: [Bash(node ${CLAUDE_SKILL_DIR}/../paper-pipeline/scripts/ledger.mjs:*)]
---

# A skill that asks the port where it is

Record the verdict:

```
node ${CLAUDE_SKILL_DIR}/../paper-pipeline/scripts/ledger.mjs record planted . FINDING 1 report.md
```

Paths inside the repository, such as `skills/paper-pipeline/scripts/consumer.mjs`, are not
install-specific and must stay quiet: they are the same in every channel.
