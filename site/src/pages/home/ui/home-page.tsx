import {
  explain,
  folder,
  FindingRow,
  pageLimit,
  prose,
  render,
  study,
  type Finding,
} from "@/entities/finding";
import {
  fencedAfter,
  layoutEntries,
  readmeContent,
  headlineVenues,
} from "@/shared/lib/readme";
import { Faq } from "@/widgets/faq";
import { FirstRun } from "@/widgets/first-run";
import { GetStarted } from "@/widgets/get-started";
import { Hero } from "@/widgets/hero";
import { Journey, type Stop } from "@/widgets/journey";
import { SiteFooter } from "@/widgets/site-footer";
import { SiteHeader } from "@/widgets/site-header";
import { Venues } from "@/widgets/venues";
import { readRepo } from "../api/read-repo.ts";
import { withCaption } from "../model/captions.ts";

const README = readRepo("README.md");
const readme = readmeContent(README);
const tree = layoutEntries(readRepo("docs/layout.md"), [
  "PIPELINE-STATUS.md",
  "paper.tex",
  "paperlint.json",
  "figures/",
  "repro/",
  "reviews/",
  "versions/",
]);
const venueNames = headlineVenues(readme.venues);
const firstRun = readme.lintOutput
  .filter((l) => /^\s+\d+:\d+/.test(l))
  .map(explain);
const install = readme.install.map(withCaption);
const perPaper = fencedAfter(README, "Then check it:", "sh").map(withCaption);

const Row = ({ f }: { readonly f: Finding }) => (
  <FindingRow
    level={f.level}
    title={f.title}
    plain={f.plain}
    rule={f.rule}
    raw={render(f)}
  />
);

const Example = ({
  file,
  code,
  finding,
}: {
  readonly file?: string;
  readonly code?: React.ReactNode;
  readonly finding: Finding;
}) => (
  <div className="grid grid-cols-1 gap-x-12 gap-y-8 lg:grid-cols-2">
    {file === undefined ? null : (
      <div className="self-start rounded-md bg-card p-6">
        <p className="font-mono text-code text-muted-foreground">{file}</p>
        <div className="mt-2 overflow-x-auto font-mono text-code whitespace-pre text-copy">
          {code}
        </div>
      </div>
    )}
    <div
      className={
        file === undefined
          ? "border-b border-border lg:col-span-2"
          : "border-b border-border"
      }
    >
      <Row f={finding} />
    </div>
  </div>
);

const stops: readonly Stop[] = [
  {
    n: "01",
    when: "Before you submit",
    title: "What gets a paper sent back",
    text: "The page limit for your kind of paper, the venue's template, fonts, page size and columns, a required section, and your name in a double-blind PDF. Build the PDF once, and every check reads it.",
    badge: "On by default",
    on: true,
    example: <Example finding={pageLimit} />,
  },
  {
    n: "02",
    when: "From the first file",
    title: "A tidy paper folder",
    text: "paperlint new makes one folder per paper, with a place for each kind of file. A file left where it does not belong is flagged, with where to move it.",
    badge: "On by default",
    on: true,
    example: (
      <Example
        file="papers/my-paper/"
        code={
          <>
            {tree.map((e) => (
              <div key={e.name} className="flex gap-4">
                <span className="w-44 shrink-0">├── {e.name}</span>
                <span className="truncate text-muted-foreground">{e.note}</span>
              </div>
            ))}
            <div>
              └──{" "}
              <span className="text-error line-through">
                results-final-v2.csv
              </span>
            </div>
          </>
        }
        finding={folder}
      />
    ),
  },
  {
    n: "03",
    when: "While you measure",
    title: "Studies planned before they run",
    text: "Each study gets a numbered entry in repro/studies.json and a folder of its own. Once a study is running, its plan must be filled in, and a plan written after the runs must say so.",
    badge: "Once your paper has a study",
    on: true,
    example: (
      <Example
        file="repro/studies.json"
        code={`{ "id": "P1-S01",\n  "title": "Baseline pass rate",\n  "status": "running",\n  "plan": "plan.json" }`}
        finding={study}
      />
    ),
  },
  {
    n: "04",
    when: "When you write",
    title: "Writing limits, if you want them",
    text: "Optional limits on sentence, paragraph and caption length, and a term used before it is defined. They stay off until you switch them on for a paper or a project.",
    badge: "Opt-in",
    on: false,
    example: (
      <Example
        file="paperlint.json"
        code={`{ "rules": {\n    "tex/max-sentence-words": ["warn", { "max": 55 }] } }`}
        finding={prose}
      />
    ),
  },
];

/** paperlint.dev: everything on it is read from the repository at build time or quoted with a test behind it. */
export function HomePage() {
  return (
    <>
      <SiteHeader />
      <main>
        <Hero
          venues={venueNames}
          install={readme.install}
          caption="Installs paperlint and sets up your project. Paste it into a terminal in your project's folder; it needs Node.js 22.13 or newer."
        />
        <FirstRun findings={firstRun} />
        <Journey stops={stops} />
        <Venues venues={readme.venues} />
        <GetStarted install={install} perPaper={perPaper} />
        <Faq />
      </main>
      <SiteFooter disclaimer={readme.disclaimer} />
    </>
  );
}
