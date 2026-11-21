# Website

The project's domain is **[paperlint.dev](https://paperlint.dev)**, registered in November 2026
through Vercel. The site is `site/`: a static Next.js export, built from this repository
([#342](https://github.com/zernie/paperlint/issues/342)). The design and what the page may claim are in
[`site/CLAUDE.md`](../site/CLAUDE.md).

- `.dev` is on the HSTS preload list, so browsers only open it over HTTPS: the site needs a
  certificate from its first deploy. Vercel issues one for a domain it serves.
- Until the site is live, the npm page links to the GitHub README: `package.json` sets no
  `homepage`, only `repository`. Add `"homepage": "https://paperlint.dev"` once the domain serves the
  page.

## Where its content comes from

`npm run site:build` installs `site/`'s own dependencies, runs its gates (Steiger and ESLint, `tsc`,
vitest with 100% coverage of the pure logic) and then `next build`, which writes plain HTML to
`site/out/`. Vercel runs only `next build`; the gates run in the `site` CI job. At build time the page
reads:

| what the page shows                                | read from                                                                                                                                                                          |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| the install command, in Install                    | `INIT` in `site/src/shared/config/install.ts`; a test checks that the first `sh` block under "A new paper" in `README.md` runs it                                                  |
| the first two findings of checkpoint 01            | the `text` block after "the first run already catches something" in `README.md`, explained in `site/src/entities/finding/model/explain.ts`                                         |
| the headline's venue names                         | the "Supported venues" table in `README.md`                                                                                                                                        |
| the venue grid, one column per field               | "Editions, by field" and "Families" in `docs/venues.md`, each series' `"name"` in `presets/`, the README's table for format and limits                                             |
| "Check the venue's own call before you submit"     | the README's quote that starts with it                                                                                                                                             |
| the paper folder in the journey                    | the generated tree in `docs/layout.md`                                                                                                                                             |
| every other finding in the journey                 | quoted in `site/src/entities/finding/model/findings.ts` from the file it names                                                                                                     |
| the hook's output in the replay on `/integrations` | `site/src/pages/integrations/model/hook-example.json`; `src/lint-edited-site-example.test.ts` runs the real `lint-edited` hook on that edit and fails when it prints anything else |
| the plugin commands on `/integrations`             | the GitHub address in `site/src/shared/config/links.ts` and the `name` in `package.json` (`site/src/pages/integrations/model/plugin.ts`)                                           |

When one of these is gone or reshaped, the build throws and names it, so the `site` CI job fails
rather than the page losing a section. `findings.test.ts` beside it fails when a quoted finding is no
longer in its source file.

## Deploying on Vercel

The project and the domain are the maintainer's Vercel account. Once:

1. **Add New → Project**, import `zernie/paperlint`.
2. **Root Directory**: `site`. Framework Preset: Next.js (detected). Leave the build and output
   commands at their defaults: `next.config.ts` sets `output: "export"`.
3. The build reads `../README.md` and `../docs/`: keep **Include files outside the Root Directory in
   the Build Step** on, if the settings show it.
4. **Deploy**, then **Settings → Domains → Add** `paperlint.dev` (and `www.paperlint.dev`, redirecting
   to it). The domain was bought through Vercel, so its DNS is already there.
5. Open `https://paperlint.dev` and check the certificate.

## Production on every push to `main`; previews only on request

`site/vercel.json` sets `git.deploymentEnabled` to `{ "**": false, "main": true }`: a push to `main`
deploys production, and a push to any other branch, or a pull request, deploys nothing. Vercel's
Git configuration docs: «If a branch matches multiple rules and at least one rule is true, a
deployment will occur», so `main` deploys and nothing else does. The pattern is `**`, not `*`:
minimatch's `*` does not match a `/`, so a branch such as `feat/site-landing` would match no rule.
The maintainer decided this on 2026-11-19. The Hobby plan has no project-level switch: Vercel's
deployment policies need Pro (`pro_plan_required`, measured), so the switch lives in the repository.

On the maintainer's request only:

- **A preview of a branch**: `vercel deploy` from `site/` on that branch, or the Vercel API's
  create-deployment with the branch as its git source (an agent uses the Vercel MCP tool).
- **Production without a push to `main`**: the same with `--prod`, or `target: "production"`.

A branch cut before `site/` reached `main` has no `site/vercel.json`, so Vercel still tries it and
fails with «The specified Root Directory "site" does not exist»; that status is not the pull
request's.
