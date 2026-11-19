import type { NextConfig } from "next";

// A static export: `next build` writes plain HTML to `out/`, which Vercel serves as files. No server,
// no image optimizer at runtime, no cookies.
const config: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  trailingSlash: false,
  // site/ has its own lockfile beside the repository root's; without this, Next guesses the root
  // and warns. The build still reads ../README.md through Node's fs, not through the bundler.
  turbopack: { root: import.meta.dirname },
};

export default config;
