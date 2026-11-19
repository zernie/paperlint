import { AUTHOR, GITHUB, NPM } from "@/shared/config";

/** The page's end, on the night band: the README's "an aid, not a guarantee", the links, the licence and who made it. */
export function SiteFooter({ disclaimer }: { readonly disclaimer: string }) {
  return (
    <footer data-test="footer" className="bg-night py-16 md:py-24">
      <div className="mx-auto grid max-w-page grid-cols-1 gap-8 px-6 md:px-8 lg:grid-cols-12">
        <p className="max-w-prose text-sm text-on-ink-muted lg:col-span-7">
          {disclaimer}
        </p>
        <div className="flex flex-col gap-4 text-sm lg:col-span-4 lg:col-start-9 lg:items-end">
          <p className="flex gap-6 text-on-ink-muted">
            <span>MIT licence</span>
            <a href={GITHUB} className="text-on-ink hover:underline">
              GitHub
            </a>
            <a href={NPM} className="text-on-ink hover:underline">
              npm
            </a>
            <a
              href={`${GITHUB}/tree/main/docs`}
              className="text-on-ink hover:underline"
            >
              Docs
            </a>
          </p>
          <p className="text-on-ink-muted">
            Made by{" "}
            <a
              href={AUTHOR.url}
              data-test="author"
              className="text-on-ink underline decoration-night-edge underline-offset-4 hover:decoration-on-ink"
            >
              {AUTHOR.name}
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
