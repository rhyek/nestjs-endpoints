---
description: The nestjs-endpoints command line — init, which installs the skill for coding agents.
---

# CLI

The package installs one command, `nestjs-endpoints`. Run it from the project's root:

```bash
npx nestjs-endpoints <command>
```

## `init`

Installs the [agent skill](../guide/coding-agents.md) into `.claude/skills/`, and into `.agents/`
and `.cursor/` when those folders exist. Safe to run again.

```bash
npx nestjs-endpoints init
```

### `init --refresh`

```bash
npx nestjs-endpoints init --refresh
```

Rewrites the agent skill only when it is installed, unedited and out of date, and does nothing
otherwise. Meant for a `postinstall` script.

## `help` and `--version`

`npx nestjs-endpoints help` prints the usage, and `npx nestjs-endpoints --version` the installed
version.
