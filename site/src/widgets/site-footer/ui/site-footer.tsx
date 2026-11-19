import { GITHUB, NPM } from "@/shared/config";

/** The README's "an aid, not a guarantee", the licence and the links. */
export function SiteFooter({ disclaimer }: { readonly disclaimer: string }) {
  return (
    <footer className="mx-auto mt-section max-w-page px-6 pb-16 md:px-8">
      <div className="grid grid-cols-1 gap-x-8 gap-y-6 border-t border-border pt-8 lg:grid-cols-12">
        <p className="max-w-prose text-sm text-muted-foreground lg:col-span-7">
          {disclaimer}
        </p>
        <p className="flex gap-6 text-sm text-muted-foreground lg:col-span-4 lg:col-start-9 lg:justify-end">
          <span>MIT licence</span>
          <a href={GITHUB} className="hover:text-foreground">
            GitHub
          </a>
          <a href={NPM} className="hover:text-foreground">
            npm
          </a>
          <a
            href={`${GITHUB}/tree/main/docs`}
            className="hover:text-foreground"
          >
            Docs
          </a>
        </p>
      </div>
    </footer>
  );
}
