import type { OxfmtConfig } from 'oxfmt';

// Loaded by oxfmt itself, through Node's type stripping, from the consumer's `oxfmt.config.ts`:
// keep this file free of runtime imports (type imports are erased) and of syntax Node cannot strip.
//
// oxfmt has no `extends`: a consumer spreads `oxfmtConfig` into its own and adds to it.

// What every consumer leaves unformatted. Spread into the consumer's `ignorePatterns`.
export const ignorePatterns = [
  // Mirrored from the synced-utils repo, live and two-way: formatting it in a consumer would push
  // the rewrite into the shared repo and every other consumer. It is formatted in that repo.
  'synced-utils/**',
  'pnpm-lock.yaml',
];

export const oxfmtConfig = {
  singleQuote: true,
  trailingComma: 'all',
  printWidth: 100,
  // Imports sorted in one block, with no blank line between groups. A consumer that pins some
  // packages first (react, its framework) adds `customGroups` and its own `groups`, built on these.
  sortImports: {
    // oxfmt's default order, except that a stylesheet (`./x.module.css`) stays among the relative
    // imports, in name order: moved last, it would load after the CSS of the components imported
    // beside it, and the cascade would change with the import order.
    groups: [
      'builtin',
      'external',
      ['internal', 'subpath'],
      ['parent', 'sibling', 'index', 'style'],
      'unknown',
    ],
    newlinesBetween: false,
    // A comment ends a run of imports instead of travelling with the import below it. Without
    // this, a file's header comment moves down the file with whichever import it sat on.
    partitionByComment: true,
  },
  // Off: a manifest's `//key` comments sit next to the key they explain, and sorting would move
  // them away.
  sortPackageJson: false,
} satisfies OxfmtConfig;
