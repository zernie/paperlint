/**
 * The ref `rpp init` pins the GitHub Action to, decided from the version of the package that is
 * running. semantic-release tags every release `v<version>` on the commit it publishes, so the
 * action at that tag is the same code as the installed package.
 *
 * Only a plain `X.Y.Z` has such a tag. A git checkout or `npm link` carries the unreleased
 * placeholder `0.0.0-semantically-released`, a version that could not be read is `undefined`, and
 * anything else is not known to be tagged: those return `null` ("no pin known"), and the caller
 * keeps the placeholder. A wrong tag written confidently is worse than an obvious placeholder.
 */
export function actionRef(version: string | undefined): string | null {
  return version !== undefined && /^\d+\.\d+\.\d+$/.test(version)
    ? `v${version}`
    : null;
}
