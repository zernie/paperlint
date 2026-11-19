// PLANTED: one defect for each family of rules site/eslint.config.mjs turns on.
import { useState } from "react";

export function Bad({ on }: { readonly on: boolean }) {
  if (on) {
    // react-hooks: a hook called conditionally
    useState(0);
  }
  // typed typescript-eslint: a promise nobody awaits
  Promise.resolve(1);
  return (
    <div className="text-[#fff] bg-red-500 w-[13px]">
      {/* Next: a bare <img> instead of next/image */}
      <img src="/campus.webp" alt="" />
    </div>
  );
}
