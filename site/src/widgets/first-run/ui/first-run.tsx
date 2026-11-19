import { FindingRow, type Explained } from "@/entities/finding";
import { Reveal } from "@/shared/ui/reveal";
import { SectionHeading } from "@/shared/ui/section-heading";

/** The README's first lint output, each finding in plain words first. */
export function FirstRun({
  findings,
}: {
  readonly findings: readonly Explained[];
}) {
  return (
    <section className="mx-auto max-w-page px-6 pt-section md:px-8">
      <Reveal className="grid grid-cols-1 gap-x-8 gap-y-12 lg:grid-cols-12">
        <SectionHeading label="A first check">
          What it tells you, in plain words.
        </SectionHeading>
        <div className="lg:col-span-8 lg:col-start-5">
          <p className="max-w-prose text-lead text-copy">
            Run on a new paper for AgenticDev, before its template is set, the
            first check already finds these, among others. Each comes with what
            to do; the exact output is one click away.
          </p>
          <div className="mt-8 border-b border-border">
            {findings.map((f) => (
              <FindingRow key={f.raw} {...f} />
            ))}
          </div>
        </div>
      </Reveal>
    </section>
  );
}
