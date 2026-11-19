// Tailwind v4 runs as a PostCSS plugin inside `next build`; the theme is in src/app/styles/globals.css.
const config = {
  plugins: { "@tailwindcss/postcss": {} },
};

export default config;
