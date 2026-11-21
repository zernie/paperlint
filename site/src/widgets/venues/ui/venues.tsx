import { Fragment } from "react";
import type {
  Conference,
  Edition,
  VenueField,
  VenueGrid,
} from "@/shared/lib/readme";
import { orList, venueCount } from "@/shared/lib/readme";
import { GITHUB, glossary } from "@/shared/config";
import { Hint, Term } from "@/shared/ui/hint";
import { Reveal } from "@/shared/ui/reveal";
import {
  Rubric,
  SectionHeading,
  SectionLabel,
} from "@/shared/ui/section-heading";

/** What a name's popover says: the format, then the page limits. */
const Limits = ({ e }: { readonly e: Edition }) => (
  <>
    <span className="block font-medium text-foreground">{e.format}</span>
    <span className="mt-1 block">{e.limits}</span>
  </>
);

/** A conference on its own line; the workshops held at it beneath, small and muted, by series. */
const ConferenceLines = ({ c }: { readonly c: Conference }) => (
  <li data-test="venue" data-test-meta={JSON.stringify({ id: c.id })}>
    <Hint
      className="text-left font-display text-xl text-foreground hover:text-primary"
      note={<Limits e={c} />}
    >
      {c.name}
    </Hint>
    {c.workshops.length === 0 ? null : (
      <p className="mt-1 text-sm text-muted-foreground">
        Workshops:{" "}
        {c.workshops.map((w, i) => (
          <Fragment key={w.id}>
            {i === 0 ? null : ", "}
            <Hint className="hover:text-primary" note={<Limits e={w} />}>
              <span
                data-test="venue"
                data-test-meta={JSON.stringify({ id: w.id })}
              >
                {w.series}
              </span>
            </Hint>
          </Fragment>
        ))}
      </p>
    )}
  </li>
);

/** A field's label, then its conferences with their workshops. */
const Field = ({ f }: { readonly f: VenueField }) => (
  <div
    data-test="venue-field"
    data-test-meta={JSON.stringify({ field: f.field })}
  >
    <SectionLabel>{f.field}</SectionLabel>
    <ul className="mt-6 flex flex-col gap-3">
      {f.conferences.map((c) => (
        <ConferenceLines key={c.id} c={c} />
      ))}
    </ul>
  </div>
);

/**
 * The shipped venues on a soft sand ground: the heading and a short note on the left, and on the
 * right the four fields of docs/venues.md two by two, each conference with its workshops beneath
 * it. A name opens its format and page limits. The template-only presets are one line beside the heading.
 */
export function Venues({ grid }: { readonly grid: VenueGrid }) {
  const count = venueCount(grid);
  return (
    <section
      data-test="venues"
      data-test-meta={JSON.stringify({ count })}
      className="bg-sand-soft py-band"
    >
      <Reveal className="mx-auto grid max-w-page grid-cols-1 gap-x-8 gap-y-12 px-6 md:px-8 lg:grid-cols-12">
        <div className="lg:col-span-12">
          <Rubric n="03" name="Venues" />
        </div>
        <div className="lg:col-span-4">
          <SectionHeading id="venues">
            {count} venues ship today.
          </SectionHeading>
          <p className="mt-6 max-w-measure text-body text-copy">
            Your paper names one <Term means={glossary.preset}>preset</Term>.
            Tap a name for its format and page limits.
          </p>
          <p
            data-test="venue-families"
            className="mt-6 max-w-measure font-display text-xl text-foreground"
          >
            And any {orList(grid.families)} conference, by its template.
          </p>
          <a
            href={`${GITHUB}#-add-a-venue-that-isnt-listed`}
            className="mt-4 inline-block text-body text-copy underline decoration-sand-edge underline-offset-4 hover:decoration-foreground"
          >
            Not listed? Its limits go in one small file.
          </a>
        </div>
        <div className="lg:col-span-8">
          <div className="grid grid-cols-1 gap-x-16 gap-y-12 sm:grid-cols-2">
            {grid.fields.map((f) => (
              <Field key={f.field} f={f} />
            ))}
          </div>
        </div>
      </Reveal>
    </section>
  );
}
