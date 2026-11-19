import type { Metadata } from "next";
import type { ReactNode } from "react";
import { fontVariables } from "@/app";

export const metadata: Metadata = {
  metadataBase: new URL("https://paperlint.dev"),
  title: "paperlint — a checker for LaTeX papers, before peer review",
  description:
    "paperlint checks a LaTeX paper against your venue's rules — the page limit, the template, the fonts, the references — and flags what can get it sent back before peer review.",
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
