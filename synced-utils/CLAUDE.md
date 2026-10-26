# synced-utils/ — mirrored shared code

Every directory here is a package mirrored from the `synced-utils` repo
(`packages/<name>/package/` there) by its daemon. The mirror is **two-way and live**: an edit
made here reaches the shared repo and every other consumer within a second, and vice versa.
Changes on both sides are merged file by file; when both sides changed the same file, the one
changed last wins. A deleted file is deleted everywhere — but deleting most of a package, or the
last of its `.claude` files, only counts when done in the shared repo: from here it is refused,
and the files come back.

Working rules:

- Edit freely, here or in the shared repo; both are the source of truth.
- Treat every file here as shared with other projects. Nothing project-specific belongs in it.
- `node_modules/` inside each package is **this repo's own** — linked by this repo's
  `pnpm install` from its single root `pnpm-lock.yaml`, never mirrored. There is no lockfile
  inside a package.
- This repo must keep **one shared lockfile** (never `sharedWorkspaceLockfile: false`). A package
  declares a framework it shares with the app (`@nestjs/*`, `react`) as a `peerDependency` only;
  under the shared lockfile that links it to the app's own copy. Two copies break `instanceof`
  across the boundary (an `HttpException` from a package becomes a 500).
- A `git checkout` that changes files here counts as an edit and is mirrored out. Undo with git
  on each side.
- This `CLAUDE.md` is itself mirrored (from `packages/CLAUDE.md` in the shared repo), as are the
  files a package contributes to this repo's `.claude/` (from `packages/<name>/.claude/`). Files in
  `.claude/` that no package owns are never touched.
- The daemon follows this repo if it is moved or renamed under `~/Dev`. It knows the repo by its
  directory, recorded outside the repo, so there is nothing here to commit or ignore.
- To add a package, or wire it into another workspace package:
  `synced-utils add <package> -t <workspace-package-name-or-dir>`; `-t .` wires it into the
  repo's root `package.json`, for a repo-wide tool's config (`synced-utils add oxc-config -t .`).
- To stop syncing this repo: `synced-utils remove`. What is here stays, as the repo's own files.
