import type { OxlintConfig } from 'oxlint';

// Loaded by oxlint itself, through Node's type stripping, from the consumer's `oxlint.config.ts`:
// keep this file free of runtime imports (type imports are erased) and of syntax Node cannot strip.
//
// oxlint has no `eslint:recommended` or typescript-eslint `recommended` preset to extend. It groups
// rules by category instead, and the two presets are spread over several of them: `correctness`
// holds most, and the rest (`no-fallthrough`, `no-explicit-any`, `require-await`,
// `only-throw-error`, …) fire only when named. `base` turns every one of them on, by category or
// by name, except the `no-unsafe-*` rules and `no-unnecessary-type-assertion` (see below), and
// adds the rules below that catch bugs rather than enforce a style.
//
// oxlint does not format, and none of these rules fights a formatter: the `style` category, where
// such rules live, stays off.

// What every consumer ignores. `ignorePatterns` is the one setting oxlint does NOT carry through
// `extends`, so a consumer spreads this into its own config's `ignorePatterns`.
export const ignorePatterns = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  // Mirrored from the synced-utils repo, live and two-way: `--fix` in a consumer would rewrite the
  // shared repo and every other consumer, so these files are linted there.
  'synced-utils/**',
];

export const base = {
  // `vitest`'s rules fire only on test and expect calls, so it is on everywhere: a test helper
  // outside a spec is checked too.
  plugins: ['eslint', 'typescript', 'unicorn', 'oxc', 'import', 'promise', 'vitest'],
  // Type-aware rules, through the `oxlint-tsgolint` package (TypeScript's Go port, run per
  // tsconfig). Set here rather than as `--type-aware` so the CLI, the pre-commit hook and the
  // editor extension all run them.
  options: {
    typeAware: true,
  },
  // `suspicious` whole, minus the rules turned off below: they are bugs more often than not, and
  // a rule oxlint adds there later arrives on its own. `pedantic`, `perf` and `restriction` are
  // mostly taste, so their useful rules are named one by one.
  categories: {
    correctness: 'error',
    suspicious: 'error',
  },
  env: {
    builtin: true,
    es2024: true,
  },

  rules: {
    // --- ESLint `recommended`, beyond `correctness` -----------------------------------------
    'eslint/no-case-declarations': 'error',
    'eslint/no-empty': 'error',
    'eslint/no-fallthrough': 'error',
    'eslint/no-prototype-builtins': 'error',
    'eslint/no-regex-spaces': 'error',
    // `no-octal` has no oxlint version: TypeScript rejects octal literals in strict code.

    // --- typescript-eslint `recommendedTypeChecked`, beyond `correctness` -------------------
    // Its eslint-recommended part: what replaces `arguments` and `.apply`.
    'eslint/prefer-rest-params': 'error',
    'eslint/prefer-spread': 'error',
    'eslint/no-array-constructor': 'error',
    'typescript/ban-ts-comment': 'error',
    'typescript/no-empty-object-type': 'error',
    'typescript/no-explicit-any': 'error',
    'typescript/no-namespace': 'error',
    'typescript/no-require-imports': 'error',
    'typescript/no-unsafe-function-type': 'error',
    'typescript/prefer-promise-reject-errors': 'error',
    'typescript/require-await': 'error',
    'typescript/restrict-plus-operands': 'error',
    // A promise handed where a callback's return is ignored loses its rejection. JSX attributes
    // are exempt: `onClick={async () => …}` is how React handlers are written.
    'typescript/no-misused-promises': ['error', { checksVoidReturn: { attributes: false } }],
    // TanStack Router's `redirect()` and `notFound()` are meant to be thrown, and are not Errors.
    'typescript/only-throw-error': [
      'error',
      {
        allow: [
          {
            from: 'package',
            package: '@tanstack/router-core',
            name: ['Redirect', 'NotFoundError'],
          },
        ],
      },
    ],
    // The `no-unsafe-*` rules (assignment, member-access, call, return, argument) stay off:
    // `no-explicit-any` already keeps `any` out of the code, and what is left is `any` from outside
    // (JSON, untyped libraries, test responses), where they mostly add casts.

    // An un-awaited promise loses its rejection: mark a deliberate fire-and-forget with `void`.
    // `node:test`'s `test()` returns a promise its runner awaits.
    'typescript/no-floating-promises': [
      'error',
      {
        allowForKnownSafeCalls: [
          { from: 'package', package: 'node:test', name: ['test', 'it', 'describe', 'suite'] },
        ],
      },
    ],

    // --- Bug catchers beyond the presets -----------------------------------------------------
    'eslint/array-callback-return': 'error',
    // `== null` is the one loose comparison worth keeping: it matches null and undefined.
    'eslint/eqeqeq': ['error', 'always', { null: 'ignore' }],
    'eslint/no-constructor-return': 'error',
    'eslint/no-new-wrappers': 'error',
    'eslint/no-object-constructor': 'error',
    'eslint/no-self-compare': 'error',
    'oxc/no-accumulating-spread': 'error',
    'typescript/no-deprecated': 'error',
    'typescript/no-mixed-enums': 'error',
    // Not for strings, where `value || fallback` is how an empty string means "none", nor for
    // booleans, where `a || b` means either and `a ?? b` would drop `b` whenever `a` is false.
    'typescript/prefer-nullish-coalescing': [
      'error',
      { ignorePrimitives: { string: true, boolean: true } },
    ],
    'typescript/related-getter-setter-pairs': 'error',
    // `return await` inside try/catch, so the catch sees the rejection; nowhere else.
    'typescript/return-await': ['error', 'in-try-catch'],
    // A `default` is a deliberate catch-all: only a switch without one must name every case.
    'typescript/switch-exhaustiveness-check': [
      'error',
      { considerDefaultExhaustiveForUnions: true },
    ],
    'typescript/use-unknown-in-catch-callback-variable': 'error',
    'unicorn/new-for-builtins': 'error',
    'unicorn/no-instanceof-array': 'error',
    'unicorn/no-new-buffer': 'error',
    'unicorn/no-useless-promise-resolve-reject': 'error',

    // --- Hygiene ----------------------------------------------------------------------------
    // Braces on every block. Safe alongside a formatter, which never adds or removes them.
    'eslint/curly': ['error', 'all'],
    // A logger, not the console. Scripts and specs are exempt (overrides below).
    'eslint/no-console': 'error',
    'eslint/no-new-func': 'error',
    'eslint/no-var': 'error',
    // A destructuring whose bindings are partly reassigned stays `let`.
    'eslint/prefer-const': ['error', { destructuring: 'all' }],
    'import/newline-after-import': ['error', { count: 1 }],
    'import/no-duplicates': 'error',
    'typescript/no-import-type-side-effects': 'error',
    'unicorn/prefer-node-protocol': 'error',

    // Covers unused imports too, so there's no separate unused-imports plugin. oxlint reports this
    // under the `eslint(no-unused-vars)` name even when configured via the `typescript/` namespace
    // — they are one rule, so don't also set `eslint/no-unused-vars` or the two fight.
    'typescript/no-unused-vars': [
      'error',
      {
        args: 'all',
        argsIgnorePattern: '^_',
        caughtErrors: 'all',
        caughtErrorsIgnorePattern: '^_',
        destructuredArrayIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        ignoreRestSiblings: true,
        // `--fix` deletes an unused import; an unused variable is only reported.
        fix: { imports: 'safe-fix', variables: 'off' },
      },
    ],

    // --- `suspicious` rules turned off ------------------------------------------------------
    // Nest modules and DTOs are empty or static-only classes.
    'typescript/no-extraneous-class': 'off',
    // Every `as` the type checker cannot prove: mostly DOM lookups and narrowed test fixtures.
    'typescript/no-unsafe-type-assertion': 'off',
    // TypeScript's `noImplicitReturns` covers the case that matters.
    'typescript/consistent-return': 'off',
    'eslint/no-shadow': 'off',
    'eslint/no-underscore-dangle': 'off',
    // Side-effect imports are deliberate: stylesheets, polyfills, instrumentation.
    'import/no-unassigned-import': 'off',
    'import/no-named-as-default': 'off',
    'import/no-named-as-default-member': 'off',
    'promise/always-return': 'off',
    // It takes any function whose first parameter is `err` for a node-style callback, and flags a
    // promise started there even when it is handled and marked `void`.
    'promise/no-promise-in-callback': 'off',
    // Sorting or reversing an array the code just built is fine.
    'unicorn/no-array-reverse': 'off',
    'unicorn/no-array-sort': 'off',
    'unicorn/consistent-function-scoping': 'off',
    // It reads prose as code ("what it refuses is the API's to test (apps/api/…)") and usage
    // examples in comments.
    'vitest/no-commented-out-tests': 'off',
    // `<T extends object>(attributes: T & Known)` is how a function takes an object literal with
    // extra keys and no excess-property error: the parameter is used once, and it is not needless.
    'typescript/no-unnecessary-type-parameters': 'off',
    // `Record<never, never>`, a default meaning "no keys", resolves to `{}` on purpose.
    'typescript/no-generated-empty-object-type': 'off',
    // It calls a cast needless when the cast is what gives the expression its type, and `--fix`
    // (the pre-commit hook runs it) removes it: `getByRole('textbox') as HTMLInputElement`, where
    // the cast is what infers `getByRole`'s type parameter, and a widening default,
    // `{ key = 'value' as string | null }`. tsc then fails, or the type silently narrows.
    'typescript/no-unnecessary-type-assertion': 'off',
    // A conversion is how code checks a value its types only claim to know: a server function's
    // input off the wire (`String(data.id)`), a database row whose bigint arrives as a string or
    // whose timestamp arrives as a Date. The rule trusts the type, and would remove the guard.
    'typescript/no-unnecessary-type-conversion': 'off',

    // ---------------------------------------------------------------------------------------
    // `typescript/consistent-type-imports` is DELIBERATELY NOT ENABLED. Do not turn it on here.
    //
    // typescript-eslint's version of this rule is decorator-aware: with `experimentalDecorators`
    // and `emitDecoratorMetadata` both set, it skips any file containing a decorator. **oxlint's
    // version has no such awareness**: it flags (and `--fix` rewrites) a NestJS controller's
    // constructor injection:
    //
    //     constructor(private readonly logger: StructuredLoggerService) {}
    //     -> import type { StructuredLoggerService } from '...'
    //
    // `verbatimModuleSyntax` then erases that import, the design:paramtypes metadata loses its
    // value, and Nest DI fails at RUNTIME with `UnknownDependenciesException`, while tsc, the
    // linter and CI all stay green. oxlint exposes no option to opt out per file or per decorator.
    //
    // Re-check when oxlint gains decorator-metadata support; until then this rule costs a
    // stylistic nicety and buys back a silent production break.
    // ---------------------------------------------------------------------------------------
  },

  overrides: [
    {
      // Specs, and the helpers and fakes beside them in a `test/` directory.
      files: ['**/*.spec.ts', '**/*.spec.tsx', '**/test/**'],
      rules: {
        'eslint/no-console': 'off',
        'typescript/no-explicit-any': 'off',
        // A stand-in for a promise-returning function is written `async () => value`.
        'typescript/require-await': 'off',
        // House style: every test case is `test(...)`, never `it(...)`.
        'vitest/consistent-test-it': ['error', { fn: 'test', withinDescribe: 'test' }],
        // A test asserts with `expect`, its context's (`t.expect`), a helper named `expect…`
        // (`expectTypeOf`, `expectNotLoaded`), or `assertType`.
        'vitest/expect-expect': [
          'error',
          { assertFunctionNames: ['expect*', '*.expect', 'assertType'] },
        ],
        'vitest/no-identical-title': 'error',
        // Vitest's `expect(value, message)` names what failed.
        'vitest/valid-expect': ['error', { maxArgs: 2 }],
        // `vi.fn()` takes its type from where it is handed in.
        'vitest/require-mock-type-parameters': 'off',
      },
    },
    {
      files: ['**/scripts/**'],
      rules: { 'eslint/no-console': 'off' },
    },
    {
      files: ['**/*.d.ts'],
      rules: { 'typescript/no-unused-vars': 'off' },
    },
  ],
} satisfies OxlintConfig;

// For a repo with React. Add it after `base`: `extends: [base, react]`.
export const react = {
  plugins: ['react', 'jsx-a11y'],
  rules: {
    'react/rules-of-hooks': 'error',
    'react/exhaustive-deps': 'error',
    // The React Compiler ports of the two rules above: they report the same code a second time.
    'react/hooks': 'off',
    'react/exhaustive-effect-dependencies': 'off',
    'react/memo-dependencies': 'off',
    // The automatic JSX runtime needs no `React` in scope.
    'react/react-in-jsx-scope': 'off',

    // eslint-plugin-react's `recommended`, beyond `correctness`.
    'react/display-name': 'error',
    'react/no-unescaped-entities': 'error',
    'react/no-unknown-property': 'error',

    // A `<button>` inside a form submits it unless it says otherwise.
    'react/button-has-type': 'error',
    'react/checked-requires-onchange-or-readonly': 'error',
    'react/jsx-no-constructed-context-values': 'error',
    'react/jsx-no-target-blank': 'error',
    'react/no-deriving-state-in-effects': 'error',
    'react/no-object-type-as-default-prop': 'error',
    // A component library's `autoFocus` (a dialog's first field) is its own business.
    'jsx-a11y/no-autofocus': ['error', { ignoreNonDOM: true }],

    // React Compiler checks that only matter to code it compiles: `refs` reports the latest-value
    // ref (`ref.current = value` during render, for a stable callback that reads the newest
    // props), `incompatible-library` an API the compiler cannot memoise around, and `purity` a
    // render that reads the clock (`new Date()` for today's default).
    'react/refs': 'off',
    'react/incompatible-library': 'off',
    'react/purity': 'off',
    // What it reports is re-seeding state when a prop changes or a dialog opens: one extra render,
    // which these apps accept for the simpler component.
    'react/set-state-in-effect': 'off',
    // An index is the key for a list that never reorders: loading skeletons
    // (`Array.from({ length: n })`), and TanStack Form's array fields, which it addresses by index.
    'react/no-array-index-key': 'off',
  },
  overrides: [
    {
      // A spec's component hands what it rendered to the test through an outer `let` or object.
      files: ['**/*.spec.ts', '**/*.spec.tsx'],
      rules: { 'react/globals': 'off', 'react/immutability': 'off' },
    },
  ],
} satisfies OxlintConfig;
