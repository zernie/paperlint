import type { NextConfig } from "next";

// A static export: `next build` writes plain HTML to `out/`, which Vercel serves as files. No server,
// no image optimizer at runtime, no cookies.
const config: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  trailingSlash: false,
};

export default config;
