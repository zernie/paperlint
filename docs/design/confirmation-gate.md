# A human confirmation before `submission --save` — design, waiting on the hook runtime

## Why

`paperlint submission new|update --save` (and `--submit`) changes a real submission that reviewers
see. paperlint#264: a PDF over the venue's body-page limit was uploaded by an agent; the command
printed "check it yourself" and sent it. The command now prints a `PREFLIGHT` block before every
send ([`docs/submission.md`](../submission.md#the-preflight)), but whether to send over the limit is
the author's decision, and today only prose (the `submission-portal` skill) asks the agent to put
the block in front of the author first.

What is wanted is a mechanism, not prose: **a `--save` runs only after a person answered a question
card that showed that exact PDF's verdict, and one answer allows one send.** Three hooks would do it:

1. **refuse a pre-answered card** — PreToolUse on `AskUserQuestion`: a card marked as a submission
   confirmation that arrives with `answers` already filled in by the model is denied; only a person
   may answer it;
2. **arm** — PostToolUse on `AskUserQuestion`: when the person picked the affirmative option on such
   a card, record the paper and the PDF's sha256 it was about;
3. **block and consume** — PreToolUse on `Bash`: a `paperlint submission … --save|--submit` is denied
   unless an armed, unexpired confirmation exists for that paper and that PDF's sha256; when it
   passes, the confirmation is used up.

paperlint ships its hooks as `vigiles/hook` programs (`hooks/*.hook.mjs`, wired through
`plugin/hooks/hooks.json`). The decision recorded here: **build the gate only once vigiles can
express it as typed hooks** — a confirmation before a command is a common need, and it should be a
first-class, composable form there, not a script in one consumer.

## What vigiles 38.2.0 cannot express today

Read from the installed package's declarations (`node_modules/vigiles/dist/…`, version 38.2.0).

| # | needed | what the types allow | evidence |
| --- | --- | --- | --- |
| 1 | a PreToolUse gate on `AskUserQuestion` that reads `tool_input.answers` | a gate sees a Bash `command` (`BashToolEvent`), a file `path` (`FileToolEvent`), or a `prompt` (`PromptEvent`) — never another tool's input. `decideFileGate` reads `tool_input.file_path` only | `core/hook-program.d.ts:324-338`, `:657-674`, `:696-702`; `RawHookEvent.tool_input` is `{ command?, file_path? }` at `:945-950` |
| 2 | a PostToolUse react that reads which option the person chose | `ReactEvent` has `tool`, `path`, `response`, `ctx` — no `tool_input`; `runReact` reads `tool_input.file_path` only. `response.raw` is the tool's response as text, so the answer may be readable from it (see the note below) | `core/hook-program.d.ts:855-862`, `:936-943`, `ResponseView` at `:842-852` |
| 3 | state that carries a value (the sha256) | **available**: `record(name, value?)` stores a string value; `state(name)` reads it with its age | `core/hook-state.d.ts:260-277`, `StateFact` at `:227` |
| 4 | a gate that consumes the state it allowed on | a gate returns a `Decision` (`allow` / `deny` / `ask`) with no records, and the runtime writes state only for an injection or a reaction | `core/hook-program.d.ts:100-109`; `core/hook-program.js:1427-1433` (`outcomeWrites`) |
| 5 | a Bash gate that compares the state with the PDF the command will send | the gate can read the command's text and declared `needs`; a provider is a fixed shell command gathered before `decide`, without the event, so it cannot hash the file the command names | `core/hook-providers.d.ts:25-47`, `gatherContext` at `:153` |
| 6 | keys per paper | a state key is `[A-Za-z0-9][A-Za-z0-9._-]{0,63}` — a path or a hash cannot be the key, only the value | `core/hook-state.d.ts`, `isValidStateKey` |

The nearest existing piece, `action-gate` (`dist/action-gate.d.ts`), runs a configured check command
on a tool's serialized input; it keeps no state and has no notion of a person's answer.

**Note on (2).** Claude Code 2.1.304's `AskUserQuestion` returns `{ questions, answers, … }` from
its `call()` (read from the shipped binary: `answers` is "question text → answer string"), and the
input schema has an optional `answers` field "collected by the permission component" — which the
model can also fill. If PostToolUse's `tool_response` is that object, a react can parse
`response.raw` for the chosen option; that was read, not measured in a live session. Even then a
react cannot tell a person's answer from a model's: only (1) can, and (1) is not expressible.

So today: (3) is there; (2) is half there through `response.raw`; (1), (4) and (5) are missing.

## Candidate shapes in vigiles

### A. One primitive: `confirm`

```ts
export default experimental_defineConfirmation({
  // the card that counts as a confirmation, and what it binds
  card: {
    marker: "paperlint-submission",        // a line the question must carry
    yes: "Upload",                          // the affirmative option's label
    binds: (q) => q.match(/sha2-([0-9a-f]{64})/)?.[1] ?? null,
  },
  // the command it allows, and the value that command must carry
  allows: {
    command: (c) => c.runs("paperlint") && c.hasFlag("save", "submit"),
    binds: (c) => c.flagValue("expect-sha256"),
  },
  once: true,
  within: "30m",
});
```

`vigiles compile` emits the three hooks: a PreToolUse deny for a marked card with model-filled
`answers`, a PostToolUse arm on the affirmative option, a PreToolUse Bash gate that allows a
matching, fresh, unused binding and consumes it. The runtime owns the state; the author writes no
key, no store, no expiry arithmetic. A consumer that wants "ask before `git push --force`" or
"before `npm publish`" writes the same eight lines.

### B. The generic pieces it would be made of

- `tool_input` on react events for every tool, as a typed view (`e.input.field("answers")`), and a
  gate role for any tool's input (`experimental_defineToolGate({ match: tools("AskUserQuestion"),
  decide: (e) => … })`);
- records on gate decisions — `allow(record("x", v))` — so a gate can consume what it allowed on, the
  same trailing-argument rule `notice`, `nothing` and `inject` already follow;
- an event-aware value read for a gate: either `state()` keyed by a value the gate computes
  (`stateFor("confirmed", sha)`), or a provider that receives the event.

Each is useful alone; the confirmation is three hooks written against them.

### C. B, with A as sugar

Ship B's pieces, and A as a library function in `vigiles/hook` that returns the three hook programs,
so the common case is one declaration and an unusual one drops to the pieces.

## Recommendation

**C.** The pieces in B close the capability gaps for any consumer, and a gate that cannot consume
what it allowed on, or cannot see a non-file tool's input, will be hit again. A as sugar over them
keeps "confirm with a person before this command" a one-declaration job, and keeps the three hooks
from drifting apart — the arm, the gate and the pre-answered refusal agree on the marker and the
binding because one declaration names them.

On paperlint's side the binding needs the command to carry the sha256 it was confirmed for (an
`--expect-sha256 <hex>` that `submission` refuses on mismatch), because a gate cannot hash the file
the command names (gap 5). That flag lands with the gate, not before it.

## Not covered, by any shape

A `PreToolUse` hook does not fire for a subagent's tool calls (Claude Code's documentation), and an
agent can write the runtime's state files with a file tool. The gate is a strong default for the
agent the author is talking to, not a wall; the portal's own record (`submission show`, `match`) is
still the proof of what was sent.
