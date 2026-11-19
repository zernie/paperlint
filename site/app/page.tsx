import { readFileSync } from "node:fs";
import path from "node:path";
import { readmeContent, shortName } from "../lib/content.ts";
import { CopyButton } from "./copy-button.tsx";
import { VenueCycle } from "./venue-cycle.tsx";

// `next build` runs in site/; the repository it describes is one level up.
const repo = (rel: string): string =>
  readFileSync(path.join(process.cwd(), "..", rel), "utf8");

const readme = readmeContent(repo("README.md"));
const venueNames = readme.venues
  .map((v) => shortName(v.venue))
  .filter((n): n is string => n !== null);
const installLine = readme.install.join(" && ");

const GITHUB = "https://github.com/zernie/paperlint";
const NPM = "https://www.npmjs.com/package/paperlint";

/** A lint output line with its level coloured. */
const LintLine = ({ line }: { readonly line: string }) => {
  const m = /^(\s*\S+\s+)(error|warning)(\s+.*)$/.exec(line);
  return m === null ? (
    <div>{line}</div>
  ) : (
    <div>
      {m[1]}
      <span className={m[2] === "error" ? "t-err" : "t-warn"}>{m[2]}</span>
      {m[3]}
    </div>
  );
};

export default function Home() {
  return (
    <>
      <nav className="nav">
        <a href="#" className="logo">
          <span className="mark-square" />
          paperlint
        </a>
        <div className="nav-links">
          <a href="#venues">Venues</a>
          <a href={`${GITHUB}/blob/main/docs/rules.md`}>Rules</a>
          <a href={GITHUB}>GitHub</a>
          <a href="#install" className="nav-cta">
            Get started
          </a>
        </div>
      </nav>

      <header className="hero">
        <div className="hero-text">
          <span className="eyebrow">
            <b>Open source</b> · a linter for LaTeX papers
          </span>
          <h1>
            Writing a paper
            <br />
            for <VenueCycle names={venueNames} />?
          </h1>
          <p className="lede">
            paperlint catches what gets a paper desk-rejected — the page limit,
            the wrong font, a reference that does not exist — before you submit.
          </p>
          <div className="cta">
            <div className="command">
              <span className="prompt">$</span>
              <span>{readme.install[0]}</span>
              <CopyButton text={installLine} />
            </div>
            <a href={`${GITHUB}/blob/main/docs/rules.md`} className="ghost">
              Read the checks
            </a>
          </div>
        </div>
      </header>

      <section className="window" aria-label="paperlint lint output">
        <div className="window-bar">
          <i />
          <i />
          <i />
          <span>Terminal</span>
        </div>
        <div className="terminal">
          <div className="t-dim">$ npx paperlint lint</div>
          {readme.lintOutput.map((line) => (
            <LintLine key={line} line={line} />
          ))}
        </div>
      </section>

      <section className="venues" id="venues">
        <div className="venues-inner">
          <h2>{readme.venues.length} venue presets.</h2>
          <p>
            Each holds a venue&apos;s format and page limits. Your paper names
            its venue once.
          </p>
          <div className="venue-grid">
            {readme.venues.map((v) => (
              <div key={v.preset} className="venue-card">
                <b>{v.venue}</b>
                <span className="venue-format">{v.format}</span>
                <span className="venue-limits">{v.limits}</span>
              </div>
            ))}
          </div>
          <a
            className="venues-more"
            href={`${GITHUB}#-add-a-venue-that-isnt-listed`}
          >
            Add a venue that isn&apos;t listed →
          </a>
        </div>
      </section>

      <section className="install" id="install">
        <h2>Two commands.</h2>
        <div className="command big">
          <span className="prompt">$</span>
          <span>{installLine}</span>
          <CopyButton text={installLine} />
        </div>
        <p className="note">{readme.disclaimer}</p>
      </section>

      <footer className="footer">
        <span>paperlint · MIT licence</span>
        <span>
          <a href={GITHUB}>GitHub</a> · <a href={NPM}>npm</a> ·{" "}
          <a href={`${GITHUB}/tree/main/docs`}>Docs</a>
        </span>
      </footer>
    </>
  );
}
