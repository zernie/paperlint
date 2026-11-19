import type { Venue } from "@/shared/lib/readme";
import { GITHUB } from "@/shared/config";
import { Reveal } from "@/shared/ui/reveal";
import { SectionHeading } from "@/shared/ui/section-heading";

/** The README's venue table, as an editorial table: venue, format, page limits. */
export function Venues({ venues }: { readonly venues: readonly Venue[] }) {
  return (
    <section className="mx-auto max-w-page px-6 pt-section md:px-8">
      <Reveal className="grid grid-cols-1 gap-x-8 gap-y-12 lg:grid-cols-12">
        <SectionHeading label="Venues" id="venues">
          {venues.length} venue presets ship today.
        </SectionHeading>
        <div className="lg:col-span-8 lg:col-start-5">
          <p className="max-w-prose text-lead text-copy">
            A preset holds a venue&apos;s format and page limits. Your paper
            names its venue once, and every check reads it from there.
          </p>
          <table className="mt-8 w-full border-b border-border text-left">
            <thead>
              <tr className="text-label font-medium text-muted-foreground uppercase">
                <th className="py-3 pr-6 font-medium">Venue</th>
                <th className="hidden py-3 pr-6 font-medium sm:table-cell">
                  Format
                </th>
                <th className="py-3 font-medium">Page limits</th>
              </tr>
            </thead>
            <tbody>
              {venues.map((v) => (
                <tr
                  key={v.preset}
                  className="border-t border-border align-baseline"
                >
                  <th
                    scope="row"
                    className="py-4 pr-6 font-display text-xl font-normal text-foreground"
                  >
                    {v.venue}
                  </th>
                  <td className="hidden py-4 pr-6 text-sm text-muted-foreground sm:table-cell">
                    {v.format}
                  </td>
                  <td className="py-4 text-sm text-copy">{v.limits}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
