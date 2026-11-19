import { Reveal } from "@/shared/ui/reveal";
import { SectionHeading } from "@/shared/ui/section-heading";

// Each answer is checked against README.md, docs/install.md and docs/references.md.
const QUESTIONS = [
  {
    q: "Do I need to know how to program?",
    a: "No. You copy a few commands into a terminal. You need Node.js 22.13 or newer, and TeX Live to build the PDF. The checker itself uses no AI.",
  },
  {
    q: "Does it change my paper?",
    a: "Not unless you ask. Checking only reads your paper and reports. A fix command can rewrite three small typographic slips (§ to “Section”, .05 to 0.05, one style of figure reference) and nothing else. Building writes the PDF and its records next to your paper; creating a paper never touches a paper.tex that already exists.",
  },
  {
    q: "Is my paper sent anywhere?",
    a: "Checking runs on your computer and works offline. Building looks up each reference in public catalogues (Crossref, OpenAlex, Semantic Scholar, arXiv, doi.org and DBLP), sending only that reference's DOI, arXiv id or title. The answers are kept for 30 days.",
  },
] as const;

/** Three questions a scientist who does not program asks first. */
export function Faq() {
  return (
    <section className="mx-auto max-w-page px-6 pt-section md:px-8">
      <Reveal className="grid grid-cols-1 gap-x-8 gap-y-12 lg:grid-cols-12">
        <SectionHeading label="Questions">Before you install.</SectionHeading>
        <dl className="border-b border-border lg:col-span-8 lg:col-start-5">
          {QUESTIONS.map(({ q, a }) => (
            <div key={q} className="border-t border-border py-10">
              <dt className="font-display text-subtitle text-foreground">
                {q}
              </dt>
              <dd className="mt-4 max-w-prose text-body text-copy">{a}</dd>
            </div>
          ))}
        </dl>
      </Reveal>
    </section>
  );
}
