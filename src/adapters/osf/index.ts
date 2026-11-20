/**
 * OSF (osf.io), as the `ArtifactHost` port: its API read and WaterButler written over `fetch`, its
 * answers parsed here, its token variable and page. Everything that changes if OSF's API does lives
 * in this folder; `cassette/README.md` says which answers are recorded and which are written from
 * OSF's source. A contributor adding a host copies this folder's shape: `host.io.ts`, `response.ts`,
 * a cassette and its test, and one line in `ARTIFACT_HOSTS` (src/cli.ts).
 */
export { OSF, osfHost, type OsfUrls } from "./host.io.ts";
export {
  parseFile,
  parseListing,
  parseUploaded,
  statusFailure,
} from "./response.ts";
