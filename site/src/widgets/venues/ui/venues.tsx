import type { Venue } from "@/shared/lib/readme";
import { GITHUB, glossary } from "@/shared/config";
import { Hint, Term } from "@/shared/ui/hint";
import { Reveal } from "@/shared/ui/reveal";
import { SectionHeading } from "@/shared/ui/section-heading";

/** The README's venue table as a short list of names; each name opens its format and page limits. */
export function Venues({ venues }: { readonly venues: readonly Venue[] }) {
  return (
    <section className="mx-auto max-w-page px-6 pt-section md:px-8">
      <Reveal className="grid grid-cols-1 gap-x-8 gap-y-10 lg:grid-cols-12">
        <SectionHeading label="Venues" id="venues">
          {venues.length} venue presets ship today.
        </SectionHeading>
        <div className="lg:col-span-8">
          <p className="max-w-prose text-body text-copy">
            Your paper names one <Term means={glossary.preset}>preset</Term>.
            Tap a name for its format and page limits.
          </p>
          <ul className="mt-8 grid grid-cols-1 border-t border-border sm:grid-cols-2">
            {venues.map((v) => (
              <li key={v.preset} className="border-b border-border">
                <Hint
                  className="flex w-full items-baseline justify-between gap-4 py-4 pr-4 text-left hover:text-primary"
                  note={
                    <>
                      <span className="block font-medium text-foreground">
                        {v.format}
                      </span>
                      <span className="mt-1 block">{v.limits}</span>
                    </>
                  }
                >
                  <span className="font-display text-xl text-foreground">
                    {v.venue}
                  </span>
                  <span className="shrink-0 text-sm text-muted-foreground">
                    {v.format.split(" ")[0]}
                  </span>
                </Hint>
              </li>
            ))}
          </ul>
          <a
            href={`${GITHUB}#-add-a-venue-that-isnt-listed`}
            className="mt-6 inline-block text-body text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
          >
            Your venue is not listed? Copy its page limit from the call for
            papers into one small file.
          </a>
        </div>
      </Reveal>
    </section>
  );
}
