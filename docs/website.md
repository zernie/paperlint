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

| what the page shows                            | read from                                                                       |
| ---------------------------------------------- | ------------------------------------------------------------------------------- |
| the install commands                           | the first `sh` block under "A new paper" in `README.md`                         |
| the lint output under the hero                 | the `text` block after "the first run already catches something" in `README.md` |
| the venue cards and the headline's venue names | the "Supported venues" table in `README.md`                                     |
| "An aid, not a guarantee"                      | the README's quote of that name                                                 |
| the paper folder in the journey                | the generated tree in `docs/layout.md`                                          |
| each finding in the journey                    | quoted in `site/src/entities/finding/model/findings.ts` from the file it names  |

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

Every push to `main` then redeploys, and every pull request gets a preview URL.
