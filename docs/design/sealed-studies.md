# Sealed studies — design

## Why

A blind study's outcomes are computed by an automated runner in the same workspace where the people
deciding exclusions work: which runs count, which units are dropped, which arm a borderline case
belongs to. Until now "blind" was an honour system. The runner wrote plaintext result files into the
repository, and anyone deciding an exclusion could open them, by accident or not. Nothing recorded
whether they had, and nothing stopped a result from being swapped after the decision.

What is needed:

1. results encrypted at rest from the moment they are written;
2. anyone — the runner — can seal; only the holder of a private key can unseal;
3. unsealing is gated on a recorded decision;
4. after unsealing, anyone can check that the plaintext is the one that was sealed: no swap after the
   decision.

This note covers 1, 2 and 4, and the declaration that 3 rests on. **Unsealing itself is not built
yet:** where the private key lives, how it is recovered, and what a reviewer has to trust are an open
decision (below). Everything here works without that decision and does not presume its answer.

## What is decided

1. **Crypto is the age CLI, driven, never implemented.** `paperlint studies seal` runs
   `age -r <recipient>…` with the plaintext on stdin and reads the ciphertext from stdout
   (`src/adapters/age/`). age encrypts to public keys (`age1…`), so the runner needs no secret to
   seal. When age is not installed, the command stops and names how to install it. The adapter also
   reads age's header and refuses a ciphertext that does not carry one X25519 stanza per recipient
   asked, so a seal nobody could open is caught when it is written. Only native X25519 recipients
   (`age1` and 58 characters) are accepted; plugin and post-quantum recipients are refused until the
   age the commands run can be relied on to read them.

2. **The plan declares; the manifest records.** A study's `plan.json` gets one optional field:

   ```json
   {
     "blind": {
       "recipients": ["age1…"],
       "outputs": ["data/outcome/**", "RESULTS.md"],
       "unseal_after": { "file": "exclusions.md", "note": "exclusions frozen" }
     }
   }
   ```

   It says what is sealed and to whom, never whether it is. Whether a study is sealed lives in
   `sealed.json`, beside the plan, written only by the commands:

   ```json
   {
     "recipients": ["age1…"],
     "files": [
       {
         "path": "RESULTS.md",
         "sha256": "<plaintext>",
         "size": 812,
         "age_sha256": "<ciphertext>",
         "sealed_at": "2026-10-16T10:00:00.000Z"
       }
     ],
     "unsealed": null
   }
   ```

   `unsealed` is `null` or `{ "at", "gate": { "file", "commit", "date" } }`: there is no
   `"sealed": true` flag that could disagree with anything, and an unsealing cannot be written down
   without the commit it waited for. Its shape is provisional until the unsealing is designed.

3. **Contradictions are parse errors** (zod, in `src/adapters/study-registry/`; the domain types and
   the schemas are proven the same type at compile time, as for the rest of the plan):
   - no recipient, a repeated one, or one that is not a native age recipient;
   - no output, a repeated one, or one that leaves the study's folder (`..`, an absolute path, a
     backslash) or names the study's own files (`sealed.json`, `README.md`, `*.age`);
   - an `unseal_after.file` an output would match: the decision would be sealed with the results;
   - `blind` under `extra`: one place says whether a study is blind;
   - in the manifest, a repeated path, a digest or a commit that is not one, an unsealing without its
     gate.

   Even an output glob of `**` never seals the plan, the README, the manifest, the decision file or
   a ciphertext (`isSealable`, `src/domain/sealed-study.ts`).

4. **`paperlint studies seal <paper-dir> <id>`.** Every file under the study's folder that the
   outputs match is encrypted to `<file>.age`; the manifest records its sha256, size, the
   ciphertext's sha256 and the time; then the plaintext is removed. The order — ciphertexts, then the
   manifest, then the removals — is the one a crash survives: a re-run finds the plaintext, sees the
   same sha256 already sealed, and only removes it. It is idempotent, and it refuses:
   - a plaintext whose bytes differ from the ones sealed under that path — the sealed result stands,
     and replacing it is a deliberate `git rm` of the `.age` file, visible in the history;
   - a study already unsealed;
   - a plan whose recipients differ from the ones the study was sealed to;
   - an unreadable manifest (never overwritten);
   - a first seal that matches no file (a misconfigured `outputs` is said, not sealed as empty).

   Every encryption happens before anything is written, so a failure leaves the tree as it was.

5. **`paperlint studies verify <paper-dir> <id>`, no key needed.** Every ciphertext against the
   `age_sha256` the manifest recorded — a swapped or missing ciphertext is seen by anyone — and, once
   the manifest says unsealed, every plaintext against its `sha256` and `size`. A mismatch exits 1 and
   names each file. The ciphertext hash is what makes the plaintext check meaningful: age has no
   signature, anyone holding the public key can produce a valid ciphertext of something else, and
   only a hash recorded before unsealing tells the two apart. The manifest is committed with the
   ciphertexts, so the hashes are public before anyone can decrypt — a commitment, revealed later.

6. **The lint rule `repro/blind-plaintext`, an error.** For every study whose plan has `blind` and
   whose manifest does not say unsealed: each file on disk under its folder that the outputs match is
   one finding, and an unreadable manifest is one more (it is never read as "unsealed"). It reads the
   disk, not git — a plaintext in the workspace defeats the blinding whether it is tracked or ignored.
   It is the automatic block: the commit hooks and CI that run `paperlint lint` fail on it. A study
   sealed correctly is silent.

## Where each part lives

| part                                                       | file                                              | layer   |
| ---------------------------------------------------------- | ------------------------------------------------- | ------- |
| `Blind`, the manifest, what is sealable, seal steps, judge | `src/domain/sealed-study.ts`                      | domain  |
| the schemas of `blind` and `sealed.json`                   | `src/adapters/study-registry/`                    | adapter |
| encrypting with age, checking its header                   | `src/adapters/age/`                               | adapter |
| what a seal needs of a program; removing a file            | `src/ports/sealer.ts`, `src/ports/remove-file.ts` | port    |
| finding blind studies, the rule                            | `src/blind-plaintext-rule.ts`                     | app     |
| `seal` and `verify`                                        | `src/sealed-studies.ts`, `src/studies.ts`         | app     |
| wiring: age with `PATH` only, the clock                    | `src/cli.ts`                                      | root    |

## Prior art

The two papers are cited from memory and were not re-read for this note; the tools' behaviour
was checked against their own documentation and, for age, against the CLI (1.1.1).

| what                                                                                | what we take                                                                                                            | what we do not                                                                                          |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Blind analysis in physics (Klein & Roodman, _Annu. Rev. Nucl. Part. Sci._ 55, 2005) | the result is hidden until the analysis choices are frozen; unblinding is a recorded step                               | their hiding methods (offsets, scrambled labels) — ours are files, so encryption is the simplest hiding |
| MacCoun & Perlmutter, "Hide results to seek the truth", _Nature_ 526, 2015          | blinding as a defence against choosing the analysis by its outcome, beyond physics                                      | —                                                                                                       |
| Pre-registration (OSF, AsPredicted)                                                 | the decision is fixed in a timestamped public record before the outcome is seen; here, a commit                         | an outside registry: the repository's history is the record                                             |
| Commit-then-reveal (hash commitments)                                               | the manifest's sha256 is published before the plaintext is; verification is recomputing it                              | salted commitments: the ciphertext already hides the plaintext                                          |
| age (https://age-encryption.org) and SOPS, which can encrypt to age recipients      | public-key file encryption with small keys and a stable format; SOPS shows age recipients in a config file are workable | SOPS's per-value encryption: results are whole files                                                    |
| git-crypt, git-secret                                                               | encrypted files committed to git                                                                                        | transparent decryption on checkout: the point here is that the workspace cannot decrypt                 |

## Open: the private key (paused)

Unsealing — `paperlint studies unseal`, the gate on `unseal_after.file` being committed (with the
commit and its date recorded in `unsealed.gate`), decryption, the check of every sha256 against the
manifest before anything is written — is designed but not built. It waits on one decision: where the
private key lives (a person's machine, a CI secret, a hardware key), how it is recovered if lost, how
a person with no local computer creates a key pair, and what a reviewer of the paper has to trust
about who could have decrypted early. Each answer changes the command's options and its threat
model, so none is presumed here.

What does not wait: anything sealed now can be unsealed by any later design, because the format is
plain age to the plan's recipients, and `verify` already checks the plaintext against the manifest
once a manifest says unsealed.

## What it does not check

- That no one decrypted early. Holding the private key is holding the results; the lint and the
  commands keep plaintext out of the workspace, not out of the key holder's hands.
- That the runner sealed promptly. A result can sit in plaintext between being written and being
  sealed; the lint catches it at the next `paperlint lint`, and the runner should seal before it
  exits.
- Files outside the study's folder. Outputs are relative to it by construction.
- Whether `exclusions.md` says anything. The gate is that it is committed, not what it holds.
