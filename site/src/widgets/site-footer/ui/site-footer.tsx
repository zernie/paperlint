import { AUTHOR, GITHUB, NPM } from "@/shared/config";

/** The page's thin base, ink on stone: the README's "an aid, not a guarantee", the links, the licence and who made it. */
export function SiteFooter({ disclaimer }: { readonly disclaimer: string }) {
  return (
    <footer
      data-test="footer"
      className="border-t border-border bg-stone py-12"
    >
      <div className="mx-auto grid max-w-page grid-cols-1 gap-8 px-6 md:px-8 lg:grid-cols-12">
        <p className="max-w-prose text-sm text-muted-foreground lg:col-span-7">
          {disclaimer}
        </p>
        <div className="flex flex-col gap-4 text-sm text-muted-foreground lg:col-span-4 lg:col-start-9 lg:items-end">
          <p className="flex gap-6">
            <span>MIT licence</span>
            <a href={GITHUB} className="text-foreground hover:underline">
              GitHub
            </a>
            <a href={NPM} className="text-foreground hover:underline">
              npm
            </a>
            <a
              href={`${GITHUB}/tree/main/docs`}
              className="text-foreground hover:underline"
            >
              Docs
            </a>
          </p>
          <p>
            Made by{" "}
            <a
              href={AUTHOR.url}
              data-test="author"
              className="text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
            >
              {AUTHOR.name}
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
