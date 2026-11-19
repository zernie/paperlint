import type { Metadata } from "next";
import type { ReactNode } from "react";
import { fontVariables } from "@/app";
// The page's older plain CSS, after the Tailwind entry so it still wins while the page moves to
// the design tokens (src/app/styles/globals.css).
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://paperlint.dev"),
  title: "paperlint — a linter for LaTeX papers",
  description:
    "paperlint catches what gets a paper desk-rejected — the page limit, the wrong font, a reference that does not exist — before you submit.",
};

export default function RootLayout({
  children,
}: {
  readonly children: ReactNode;
}) {
  return (
    <html lang="en" className={fontVariables}>
      <body>{children}</body>
    </html>
  );
}
