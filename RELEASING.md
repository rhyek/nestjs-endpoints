# Releasing

A release is a pull request whose `CHANGELOG.md` has a new version heading at the top. Merging
it publishes that version to npm and creates the `vX.Y.Z` GitHub release. A pull request with no
new heading (a docs fix, a refactor) merges without releasing anything.

Publishing uses npm **trusted publishing** (OIDC): no npm token is stored anywhere, and
[provenance](https://docs.npmjs.com/generating-provenance-statements) is attached automatically.

## Cutting a release

1. In the feature branch, add the change's entry under a new heading at the **top** of
   `CHANGELOG.md`, grouped under `### Features` / `### Fixes` / `### Breaking changes`. Each
   entry is one sentence with a bold summary:

   ```md
   ## 3.1.0

   ### Features

   - **What changed.** See [the README](README.md#setup).
   ```

   A prerelease heading (`## 4.0.0-beta.1`) is published under the npm dist-tag named by its
   label, `beta`, and marked as a prerelease on GitHub, so `npm install nestjs-endpoints` keeps
   resolving to the latest stable version. A stable version goes to `latest`.

2. Open the pull request. CI runs `node scripts/changelog.ts check`, which fails if the top
   section is empty, its version isn't newer than the latest release, or it adds an entry to a
   version already released (rewording one, or fixing its link, is fine). It also fails if any
   link in `CHANGELOG.md` points at a file or heading that doesn't exist.

3. Merge it. `.github/workflows/release.yaml` reads the top heading and, if that version isn't
   out yet, builds the package, then:
   - publishes the package to npm, tokenless over OIDC;
   - creates the GitHub release and its `vX.Y.Z` tag, with the section as its notes and its
     relative links pinned to the tag.

   Each half runs only if it's missing, so if one fails, re-run the workflow (Actions → release
   → Run workflow, on `main`) and it finishes the other.

Releases up to 2.3.0 are tagged without the `v`. The changelog check compares only against
`vX.Y.Z` tags.

`main` takes changes only through pull requests, with CI's `check` passing:
[`.github/rulesets/main.json`](.github/rulesets/main.json) is the repository ruleset that
enforces it.

## One-time setup

1. **Point the trusted publisher at the `release` environment** on npmjs.com → nestjs-endpoints
   → **Settings → Trusted Publisher → GitHub Actions**:
   - Organization or user: `rhyek`
   - Repository: `nestjs-endpoints`
   - Workflow filename: `release.yaml`
   - Environment: `release`

2. **Make `main` pull-request only** by creating the ruleset:

   ```sh
   gh api repos/rhyek/nestjs-endpoints/rulesets --method POST --input .github/rulesets/main.json
   ```

3. **Limit the `release` environment to `main`** (Settings → Environments → `release` →
   Deployment branches and tags → Selected branches → `main`). The environment appears after the
   workflow's first run.

4. **Serve the docs site from GitHub Pages** (Settings → Pages): set the source to **GitHub
   Actions**, and set the custom domain, with its DNS record pointing at GitHub Pages.
   `.github/workflows/docs.yaml` deploys on every push to `main` that touches the docs.

5. **Delete a pull request's branch when it merges:**

   ```sh
   gh api repos/rhyek/nestjs-endpoints --method PATCH -F delete_branch_on_merge=true
   ```
