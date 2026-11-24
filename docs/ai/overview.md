---
description: How nestjs-endpoints tells a coding agent about itself - the rules file and skills it installs, and llms.txt on the site and inside the npm package.
---

# Built for agents

A coding agent working on your API needs to know that its endpoints are nestjs-endpoints', and
how they work in the version you have installed. The package gives it both.

| Piece                               | What the agent gets                                         |
| ----------------------------------- | ----------------------------------------------------------- |
| [The agent files](#the-agent-files) | Knows the API is built with nestjs-endpoints, and where to read. |
| [`llms.txt`](#llms-txt)             | These docs as Markdown, on the web and inside the package.  |

## The agent files

Installing nestjs-endpoints writes three files into your repository:

| File                                                | Read by                                                              |
| --------------------------------------------------- | -------------------------------------------------------------------- |
| `.claude/rules/nestjs-endpoints.md`                 | Claude Code, at the start of every session.                          |
| `.claude/skills/nestjs-endpoints/SKILL.md`          | Agents that load skills.                                             |
| `.claude/skills/nestjs-endpoints-refactor/SKILL.md` | You, as `/nestjs-endpoints-refactor`: it reworks the API to the [recommended architecture](../guide/architecture.md), and shows its plan before it edits. Claude Code never starts it on its own. |

The skills are also copied into `.agents/` and `.cursor/` where those folders exist. The rules
file and the first skill point an agent at the [index](#llms-txt) inside the installed package,
so it reads the page it needs, for the version you have. Commit them.

- **They are written in a git checkout only.** An install in CI, or with no checkout, such as
  in a Docker build, writes nothing.
- **They stay current.** Each install rewrites a file an older version wrote, unless you edited
  it. A file you edited, or wrote yourself, is left as it is.
- **With pnpm, approve the package's build script.** pnpm runs a dependency's `postinstall`
  only once it is allowed, in `pnpm-workspace.yaml`:

  ```yaml
  allowBuilds:
    nestjs-endpoints: true
  ```

  Set it to `false` to have none of the files.
- **With bun, trust the package:** `"trustedDependencies": ["nestjs-endpoints"]` in your
  `package.json`.
- **To skip them** with npm or yarn, install with `NESTJS_ENDPOINTS_SKIP_AGENT_FILES=1`.
- **Each API reads the docs of the version it installed**, found from its directory, in a
  monorepo too. Where they can't be found, the files point at
  [nestjs-endpoints.dev/llms.txt](https://nestjs-endpoints.dev/llms.txt).
- **For agents that read `AGENTS.md`**, add the same lines to it:

  ```md
  This repo's HTTP APIs are built with nestjs-endpoints. Before you
  add, change, move or test an endpoint or a router, or generate or
  call a client, read the `llms.txt` of the version the API
  installed, from its directory:
  `node -p "require.resolve('nestjs-endpoints/docs/llms.txt')"`.
  Then read the page it names for the task.
  ```

## `llms.txt`

The docs follow the [llms.txt](https://llmstxt.org/) convention, generated from the same
Markdown as this site:

| URL                                           | What it is                                       |
| --------------------------------------------- | ------------------------------------------------ |
| `https://nestjs-endpoints.dev/llms.txt`       | An index: one line per page, with a description. |
| `https://nestjs-endpoints.dev/llms-full.txt`  | Every page in one file.                          |
| `https://nestjs-endpoints.dev/<page>.md`      | Any page as Markdown: add `.md` to its URL.      |

The same index and pages ship **inside the npm package**:

```
node_modules/nestjs-endpoints/docs/llms.txt
node_modules/nestjs-endpoints/docs/guide/…
node_modules/nestjs-endpoints/docs/clients/…
```

That copy matches the installed version, works offline, and is what the
[agent files](#the-agent-files) point at. The index opens by sending an agent to the
[agent playbook](./playbook.md), the page written for the agent itself, with the rules and a
recipe for each task.
