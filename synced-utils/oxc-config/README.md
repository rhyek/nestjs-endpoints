# `@rhyek/oxc-config`

The shared oxlint and oxfmt configuration. For lint, it gives the rules of ESLint's `recommended`
and typescript-eslint's `recommendedTypeChecked` that oxlint has (it has no such presets, only
categories), plus the rules that catch bugs rather than enforce a style. For
formatting, it gives the house style: single quotes, trailing commas, 100 columns, imports sorted.

| Import                     | What                                                                                                                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@rhyek/oxc-config/oxlint` | `base`, every TypeScript repo's rules, type-aware ones included; `react`, the React and accessibility rules, added after `base`; `ignorePatterns`, to spread into the consumer's own |
| `@rhyek/oxc-config/oxfmt`  | `oxfmtConfig`, to spread into the consumer's config; `ignorePatterns`, to spread into its `ignorePatterns`                                                                           |

What a consumer needs: `oxlint`, `oxlint-tsgolint` (the type-aware rules) and `oxfmt` as its own
dev dependencies, this package referenced from its root `package.json`
(`synced-utils add oxc-config -t .`), and two files at its root.

```ts
// oxlint.config.ts
import { defineConfig } from 'oxlint';
import { base, ignorePatterns, react } from '@rhyek/oxc-config/oxlint';

export default defineConfig({
  extends: [base, react],
  env: { node: true },
  // Not inherited through `extends`: spread the shared ones in.
  ignorePatterns: [...ignorePatterns, '**/routeTree.gen.ts'],
  overrides: [{ files: ['apps/api/test/**'], rules: { … } }],
});
```

```ts
// oxfmt.config.ts
import { ignorePatterns, oxfmtConfig } from '@rhyek/oxc-config/oxfmt';
import { defineConfig } from 'oxfmt';

export default defineConfig({
  ...oxfmtConfig,
  ignorePatterns: [...ignorePatterns, '**/routeTree.gen.ts'],
});
```

The configs are loaded by oxlint and oxfmt through Node's type stripping, so the package's files
take no runtime imports. Which rules are on, and why some obvious ones are off (the `no-unsafe-*`
family, `no-unnecessary-type-assertion`, whose fix removes casts that types depend on,
`consistent-type-imports`, which breaks Nest's dependency injection), is written beside
each rule in `src/oxlint.ts`.

Verify: `pnpm test && pnpm typecheck` in this directory. The spec runs the real oxlint over a
fixture, and oxlint refuses a config naming a rule it lacks, so an upgrade that renames a rule
fails there.
