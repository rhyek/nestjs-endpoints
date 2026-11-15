---
paths:
  - "CHANGELOG.md"
  - "README.md"
  - "docs/**"
  - "packages/nestjs-endpoints/docs/**"
  - "examples/**/README.md"
---

# Changelog and public docs — written for the people who use nestjs-endpoints

**Every entry and every sentence is for a Node.js backend developer, usually a NestJS one, who
builds an app with nestjs-endpoints.** Never add an item that only a maintainer of nestjs-endpoints
would care about.

This covers `CHANGELOG.md`, `README.md`, everything under `docs/` (the public documentation site),
the agent guide shipped in the package (`packages/nestjs-endpoints/docs/agents.md`) and the
examples' READMEs. Maintainers' notes, including Superpowers' specs and plans, live in
`maintenance/docs/`, which this rule does not cover.

## Only what a user acts on

The test: **would someone using the library act on it, or need it to use the library?** If not,
it stays out.

Out, however much work it was:

- Refactors, moved or merged files, deleted internal code, renamed internals.
- The test suite, test apps, CI, lint and format config, release tooling.
- The benchmark harness and how a result was measured.
- Dependency bumps that change nothing a user sees.
- A bug that never shipped in a release on npm.

In, however technical it looks:

- Anything that breaks a user's code, config, build or generated client, with what to do about it.
- New capabilities, options and exports; changed defaults; supported versions of Node.js, NestJS,
  TypeScript, Zod and the adapters.
- Fixes to behavior a released version had.
- Performance a user's app gets.

## The docs describe the library as it is now

**Every doc but `CHANGELOG.md` describes the current library only, and never its past behavior,
options or names.** Most people reading them have never used nestjs-endpoints before: history
tells them nothing they can use, makes every page longer, and leaves them wondering whether the
old way still applies. History belongs in `CHANGELOG.md` and in commit messages.

- No "now", "no longer", "used to", "previously", "renamed from", "instead of the old …".
- No "since 3.0.0" or "as of this release" about the library's own versions. Requirements on
  other software ("Node.js >= 24.22") are current and stay.
- Don't deny an option or syntax that only existed in an earlier version.

## The changelog

Released versions are on npm (`npm view nestjs-endpoints versions`); the git tag of the same
name is the commit each was published from. A version not on npm is unreleased, and its
changelog section describes the difference from the latest released one, not the work in between.
