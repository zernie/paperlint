/**
 * Rule 1 read from the paper itself: the track and the edition its ACM preamble declares, in
 * `\acmConference[<SHORT> 'YY]{<title>}…` and `\acmBooktitle{…}`. An arXiv comment or a Semantic
 * Scholar listing says where a paper was accepted; the TeX says what this source is (a companion
 * demo, an extended abstract, a preliminary version) and which edition. A short name that is the
 * slot's own series (`AgenticDev '26`) is its main track, even when the venue is a workshop.
 * `\acmYear` is not read: on a PACM venue (CSCW) it is the journal volume's year, not the edition's.
 */
import { stripComments, type Slot, type Verdict } from "./rules.ts";

/** A track that is not the main proceedings, as an ACM preamble names it. */
const NOT_MAIN =
  /companion|extended abstracts?|\bEA\b|\bdemo|poster|workshop|doctoral|preliminary|under review|late[- ]breaking|adjunct/i;

/** One `\acmConference`: its bracketed short name (`CHI EA '26`), and the text of its arguments. */
type Declared = Readonly<{ short: string | undefined; args: string }>;

const conferencesOf = (t: string): readonly Declared[] =>
  [
    ...t.matchAll(
      /\\acmConference\s*(?:\[([^\]]*)\])?((?:\s*\{[^{}]*\}){0,4})/g,
    ),
  ].map((m) => ({ short: m[1], args: String(m[2]) }));

const seriesOf = (short: string): string =>
  short
    .replace(/\s*'\d{2}\s*$/, "")
    .trim()
    .toLowerCase();

/** The first declaration that names a track other than the main one, as the reason quotes it. */
function otherTrack(
  t: string,
  confs: readonly Declared[],
  series: string,
): string | undefined {
  if (confs.some((c) => seriesOf(c.short ?? "") === series.toLowerCase()))
    return undefined;
  return [
    ...confs.map((c) => ({
      what: c.short ?? c.args.trim(),
      text: `${c.short ?? ""} ${c.args}`,
    })),
    ...[...t.matchAll(/\\acmBooktitle\s*\{([^{}]*)\}/g)].map((m) => ({
      what: String(m[1]),
      text: String(m[1]),
    })),
  ].find((d) => NOT_MAIN.test(d.text))?.what;
}

/** The edition years the short names declare (`EUROSYS '26` is 2026). */
const declaredYears = (confs: readonly Declared[]): readonly number[] =>
  confs.flatMap((c) => {
    const yy = /'(\d{2})\s*$/.exec(c.short ?? "");
    return yy === null ? [] : [2000 + Number(yy[1])];
  });

export function judgeDeclaredVenue(
  main: string,
  slot: Pick<Slot, "series" | "year">,
): Verdict {
  const t = stripComments(main);
  const confs = conferencesOf(t);
  const track = otherTrack(t, confs, slot.series);
  if (track !== undefined)
    return {
      ok: false,
      reason: `the paper's TeX declares a track that is not the main proceedings: "${track}"`,
    };
  const other = declaredYears(confs).find((y) => y !== slot.year);
  return other === undefined
    ? { ok: true }
    : {
        ok: false,
        reason: `the paper's TeX declares the ${String(other)} edition (\\acmConference), not ${slot.series} ${String(slot.year)}`,
      };
}
