import type { Edition, VenueField, VenueGrid } from "@/shared/lib/readme";
import { orList } from "@/shared/lib/readme";
import { GITHUB, glossary } from "@/shared/config";
import { Hint, Term } from "@/shared/ui/hint";
import { Reveal } from "@/shared/ui/reveal";
import { SectionHeading, SectionLabel } from "@/shared/ui/section-heading";

/** A field with more editions than this is set in two columns, its conferences beside its workshops. */
const ONE_COLUMN = 5;

/** One edition: its name and year, a workshop's conference after it; its format and limits on hover or tap. */
const Line = ({ e }: { readonly e: Edition }) => (
  <li
    data-test="venue"
    data-test-meta={JSON.stringify({ id: e.id })}
    className="border-b border-sand-edge"
  >
    <Hint
      className="flex w-full flex-wrap items-baseline gap-x-2 py-1 text-left hover:text-primary"
      note={
        <>
          <span className="block font-medium text-foreground">{e.format}</span>
          <span className="mt-1 block">{e.limits}</span>
        </>
      }
    >
      <span className="font-display text-lg text-foreground">{e.name}</span>
      {e.parent === undefined ? null : (
        <span className="text-sm text-copy">at {e.parent}</span>
      )}
    </Hint>
  </li>
);

const List = ({ editions }: { readonly editions: readonly Edition[] }) => (
  <ul className="border-t border-sand-edge">
    {editions.map((e) => (
      <Line key={e.id} e={e} />
    ))}
  </ul>
);

/** A field's label over its editions; a long field splits into conferences and workshops. */
const Field = ({ f }: { readonly f: VenueField }) => {
  const long = f.editions.length > ONE_COLUMN;
  return (
    <div
      data-test="venue-field"
      data-test-meta={JSON.stringify({ field: f.field })}
      className={
        long ? "col-span-2 md:grow-2 md:basis-0" : "md:grow md:basis-0"
      }
    >
      <div className="flex h-10 items-end pb-3">
        <SectionLabel>{f.field}</SectionLabel>
      </div>
      {long ? (
        <div className="grid grid-cols-2 gap-x-8">
          <List editions={f.editions.filter((e) => e.parent === undefined)} />
          <List editions={f.editions.filter((e) => e.parent !== undefined)} />
        </div>
      ) : (
        <List editions={f.editions} />
      )}
    </div>
  );
};

/**
 * The shipped venues on the sand band, one column per field of docs/venues.md: each edition a short
 * line with its year, a workshop with the conference it is held at; a name opens its format and
 * page limits. The template-only presets are one line beside the heading.
 */
export function Venues({ grid }: { readonly grid: VenueGrid }) {
  const count = grid.fields.reduce((n, f) => n + f.editions.length, 0);
  return (
    <section
      data-test="venues"
      data-test-meta={JSON.stringify({ count })}
      className="bg-sand py-16"
    >
      <Reveal className="mx-auto max-w-page px-6 md:px-8">
        <div className="grid grid-cols-1 items-end gap-x-8 gap-y-6 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <SectionHeading label="Venues" id="venues">
              {count} venues ship today.
            </SectionHeading>
          </div>
          <div className="text-body text-copy lg:col-span-5">
            <p>
              Your paper names one <Term means={glossary.preset}>preset</Term>.
              Tap a name for its format and page limits.{" "}
              <a
                href={`${GITHUB}#-add-a-venue-that-isnt-listed`}
                className="underline decoration-sand-edge underline-offset-4 hover:decoration-foreground"
              >
                Not listed? Its limits go in one small file.
              </a>
            </p>
          </div>
        </div>
        <div className="mt-8 grid grid-cols-2 gap-8 md:flex">
          {grid.fields.map((f) => (
            <Field key={f.field} f={f} />
          ))}
        </div>
        <p
          data-test="venue-families"
          className="mt-8 font-display text-lg text-foreground"
        >
          Any {orList(grid.families)} conference, by its template.
        </p>
      </Reveal>
    </section>
  );
}
