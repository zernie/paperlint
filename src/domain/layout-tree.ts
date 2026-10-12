/**
 * A layout drawn as a tree — the one picture of what a paper folder may hold.
 *
 * The rules' messages, the hook's refusal and the rules' pages all show the same drawing, rendered by
 * `renderTree` from the constants that decide what is allowed (`paper-layout.ts`, `repro-layout.ts`).
 * The pages embed it between markers and a test compares them with this render, so a page cannot
 * describe a layout the code does not enforce.
 */

/** One entry of a layout: its name (a folder's ends in a slash), what it is for, what it holds. */
export interface TreeNode {
  readonly name: string;
  readonly note: string;
  readonly children: readonly TreeNode[];
}

/** An entry with nothing drawn under it. */
export const leaf = (name: string, note: string): TreeNode => ({
  name,
  note,
  children: [],
});

interface Row {
  readonly left: string;
  readonly note: string;
}

/** Each entry's line, depth first, with the branch drawing in front of its name. */
const rowsOf = (nodes: readonly TreeNode[], indent: string): readonly Row[] =>
  nodes.flatMap((n, i) => {
    const last = i === nodes.length - 1;
    return [
      { left: `${indent}${last ? "└── " : "├── "}${n.name}`, note: n.note },
      ...rowsOf(n.children, `${indent}${last ? "    " : "│   "}`),
    ];
  });

/** `nodes` under `root`, one line each, every note in one column after `←`. Pure. */
export function renderTree(root: string, nodes: readonly TreeNode[]): string {
  const rows = rowsOf(nodes, "");
  const width = Math.max(0, ...rows.map((r) => r.left.length));
  return [
    root,
    ...rows.map((r) => `${r.left.padEnd(width)}  ← ${r.note}`),
  ].join("\n");
}
