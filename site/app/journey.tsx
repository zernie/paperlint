import { readFileSync } from "node:fs";
import path from "node:path";
import { Fragment, type ReactNode } from "react";
import {
  desk,
  folder,
  prose,
  render,
  study,
  type Finding,
} from "@/entities/finding";
import { layoutEntries } from "@/shared/lib/readme";
import "./journey.css";

// `next build` runs in site/; the repository it describes is one level up.
const tree = layoutEntries(
  readFileSync(path.join(process.cwd(), "..", "docs/layout.md"), "utf8"),
  [
    "PIPELINE-STATUS.md",
    "paper.tex",
    "paperlint.json",
    "figures/",
    "repro/",
    "reviews/",
    "versions/",
  ],
);

const FindingRow = ({ f }: { readonly f: Finding }) => (
  <div className="finding">
    <span className={`level ${f.level}`}>{f.level}</span>
    <div>
      <p>{render(f)}</p>
      <code>{f.rule}</code>
    </div>
  </div>
);

interface Step {
  readonly n: string;
  readonly when: string;
  readonly title: string;
  readonly text: ReactNode;
  readonly badge: string;
  readonly on: boolean;
  readonly card: ReactNode;
}

const steps: readonly Step[] = [
  {
    n: "01",
    when: "Before you submit",
    title: "Desk-reject checks",
    text: (
      <>
        The venue&apos;s call decides the page limit for your kind of paper, the
        template, the fonts and anonymity. <code>paperlint build</code> measures
        the PDF; <code>paperlint lint</code> judges it against the venue.
      </>
    ),
    badge: "On by default",
    on: true,
    card: (
      <>
        <div className="card-label">paperlint lint</div>
        {desk.map((f) => (
          <FindingRow key={f.rule} f={f} />
        ))}
      </>
    ),
  },
  {
    n: "02",
    when: "From the first file",
    title: "Folder structure",
    text: (
      <>
        <code>paperlint new</code> creates the paper folder, and every lint
        checks its layout. A file at its root that does not belong there is
        flagged, with where it goes.
      </>
    ),
    badge: "On by default",
    on: true,
    card: (
      <>
        <div className="card-label">papers/my-paper/</div>
        <div className="tree">
          {tree.map((e) => (
            <Fragment key={e.name}>
              <span>├── {e.name}</span>
              <i title={e.note}>{e.note}</i>
            </Fragment>
          ))}
          <span>
            └── <s>results-final-v2.csv</s>
          </span>
          <i />
        </div>
        <FindingRow f={folder} />
      </>
    ),
  },
  {
    n: "03",
    when: "While you measure",
    title: "Measurements",
    text: (
      <>
        Each study gets a row in <code>repro/studies.json</code> and a folder of
        its own, named after the row. Its plan is written before its runs, so
        the result cannot reshape the question.
      </>
    ),
    badge: "Once a paper has a study",
    on: true,
    card: (
      <>
        <div className="card-label">repro/studies.json</div>
        <pre className="json">{`{ "id": "P1-S01",
  "title": "Baseline pass rate",
  "status": "running",
  "plan": "plan.json" }`}</pre>
        <FindingRow f={study} />
      </>
    ),
  },
  {
    n: "04",
    when: "When you write",
    title: "Prose",
    text: (
      <>
        Optional rules for the writing itself: a ceiling on sentence and
        paragraph length, a term used before it is defined. Off until you turn
        them on.
      </>
    ),
    badge: "Opt-in",
    on: false,
    card: (
      <>
        <div className="card-label">paperlint.json</div>
        <pre className="json">{`{ "rules": {
    "tex/max-sentence-words": ["warn", { "max": 55 }] } }`}</pre>
        <FindingRow f={prose} />
      </>
    ),
  },
];

// The road: one point per step, alternating a little either side of the centre line, in a 100 × 400 box.
const xs = steps.map((_, i) => (i % 2 === 0 ? 46 : 54));
const road = xs.reduce((d, x, i) => {
  const y = 50 + 100 * i;
  const px = i === 0 ? 50 : (xs[i - 1] ?? 50);
  return `${d} C ${px} ${y - 70}, ${x} ${y - 30}, ${x} ${y}`;
}, "M 50 0");
const roadPath = `${road} C ${xs.at(-1) ?? 50} 380, 50 380, 50 400`;

/** The four checks as stops on one road (site/CLAUDE.md, "The Journey"). */
export function Journey() {
  return (
    <>
      <section className="intro" id="journey">
        <h2>
          From the first file
          <br />
          to the camera-ready.
        </h2>
        <p>
          Four checkpoints along the way. The first two are on from day one.
        </p>
      </section>

      <section className="journey">
        <svg
          className="road"
          viewBox="0 0 100 400"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path
            d={roadPath}
            className="road-edge"
            vectorEffect="non-scaling-stroke"
          />
          <path
            d={roadPath}
            className="road-surface"
            vectorEffect="non-scaling-stroke"
          />
          <path
            d={roadPath}
            className="road-line"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        {steps.map((s, i) => (
          <article
            key={s.n}
            className={`step ${i % 2 === 0 ? "card-left" : "card-right"}`}
          >
            <div className="step-card">{s.card}</div>
            <div className="step-marker" style={{ left: `${xs[i] ?? 50}%` }}>
              {s.n}
            </div>
            <div className="step-text">
              <div className="step-when">
                <span>{s.n}</span>
                {s.when}
              </div>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
              <span className={`badge${s.on ? " on" : ""}`}>{s.badge}</span>
            </div>
          </article>
        ))}
      </section>
    </>
  );
}
