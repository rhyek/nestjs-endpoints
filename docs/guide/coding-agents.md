---
description: The agent guide nestjs-endpoints ships in its package, and the skill that points Claude Code, Cursor and other coding agents at it.
---

# Coding agents

nestjs-endpoints ships a guide written for coding agents, inside the package:

```
node_modules/nestjs-endpoints/docs/agents.md
```

It is the complete reference in one file: both endpoint builders, file-based routing, routers,
namespaces, codegen, the generated clients, testing, and a troubleshooting table. Because it is
in the package, it always matches the version you have installed.

## The skill

`npx nestjs-endpoints init` installs a skill that tells your agent when to read that guide:
whenever it works on an endpoint, a router, the generated client, or their tests.

It writes `.claude/skills/nestjs-endpoints/SKILL.md`, and the same file under `.agents/` and
`.cursor/` when those folders exist.

The skill file is managed by the package, as its banner says. `init` rewrites it from the
current template each time, so edit your own instructions elsewhere.

## Keeping it current

After upgrading nestjs-endpoints, run `init` again, or have the package manager do it:

```jsonc
// package.json
{
  "scripts": {
    "postinstall": "nestjs-endpoints init --refresh"
  }
}
```

`init --refresh` rewrites the skill only when it is installed, unedited and out of date.
Otherwise it does nothing.

## Without the skill

Any agent can be pointed at the guide directly. Add a line to your project's instructions file,
such as `AGENTS.md` or `CLAUDE.md`:

```md
This API is built with nestjs-endpoints. Before working on an endpoint, a router or the
generated client, read `node_modules/nestjs-endpoints/docs/agents.md`.
```
