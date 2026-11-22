# The agent eval

**TL;DR.** Shows whether a coding agent, told about nestjs-endpoints only by the files the
package installs, loads the skill and reads the `llms.txt` of the version the API it works on
installed. It asks Claude Code to add an endpoint in repos laid out the ways package managers lay
them out, and grades what the agent read before it wrote anything. Run it locally, after
changing `assets/agent-rules.md`, `skills/nestjs-endpoints/SKILL.md`, the playbook or how the
docs are packaged. It is not part of CI.

```bash
pnpm build                              # the library, the site, and the docs in the package
work=$(mktemp -d)                       # outside any git repository, with a neutral name
node maintenance/scripts/agent-eval/eval.ts setup --work "$work"
node maintenance/scripts/agent-eval/eval.ts run   --work "$work" --out maintenance/agent-runs/<name> \
  --token-file <file>
```

## Running it

Needs a token from `claude setup-token`, passed with `--token-file <file>` or as
`CLAUDE_CODE_OAUTH_TOKEN`. Each run is one Claude Code request on that subscription, of 20 to 90
seconds.

1. **`setup`** writes one repo per layout and setup under `<work>/`, each with a home of its own,
   so the user's skills, instructions and memory stay out of it. The package in each is a copy
   of the built one, at the paths that layout's package manager uses.
2. **`run`** asks every task under every setup, `--reps` times. It skips runs already in
   `--out`, so a stopped batch resumes, and ends with the report.
3. **`report --work <dir> --out <dir>`** grades the transcripts again and writes `report.md` and
   `results.json`.

| Option           | Default  | What it does                     |
| ---------------- | -------- | -------------------------------- |
| `--layouts a,b`  | all      | Only these layouts.              |
| `--setups a,b`   | all      | Only these setups.               |
| `--reps`         | `3`      | Runs per task per setup.         |
| `--concurrency`  | `4`      | Runs at once.                    |
| `--model`        | `sonnet` | The model Claude Code runs.      |

## What it runs

| Layout             | The repo                                                                                     |
| ------------------ | -------------------------------------------------------------------------------------------- |
| `single`           | One API at the root, the package in `node_modules/nestjs-endpoints`.                          |
| `pnpm-monorepo`    | Two APIs in a pnpm workspace, each linking the package from `node_modules/.pnpm/`; nothing at the root's `node_modules/nestjs-endpoints`. |
| `npm-two-versions` | Two APIs in an npm workspace on different versions: one hoisted to the root, the other in the API's own `node_modules`. |

| Setup       | The agent files                                          |
| ----------- | -------------------------------------------------------- |
| `installed` | The rules file and the skill, as the postinstall writes them. |
| `skill`     | The skill alone.                                         |
| `rules`     | The rules file alone.                                    |

Each layout has two tasks, a person's request to add or change an endpoint that names neither the
library nor its docs. In the monorepos each names one of the two APIs.

## How a run is graded

- **Nothing the agent runs can change anything.** `guard.ts` is a hook on every Bash command: it
  runs a command only when every part of it reads, and refuses the rest. Write and Edit aren't
  allowed either.
- **A run stops when the agent tries to write a file.** What it read before then is graded:
  whether it loaded the skill, ran the `require.resolve` command the agent files give, read the
  `llms.txt` of the copy its API resolves (by real path), read another copy's, and read the
  playbook.

Keep the transcripts out of the repo: they hold this machine's paths. `maintenance/agent-runs/` is
ignored for them.
