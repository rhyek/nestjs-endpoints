#!/usr/bin/env node
// The agent eval: asks Claude Code to work on an endpoint in repos laid out the ways package
// managers lay them out, with the agent files nestjs-endpoints installs, and grades whether the
// agent loaded the skill and read the `llms.txt` of the version the API it works on installed.
// It runs locally only; README.md beside this file has how and why.
//
//   pnpm build
//   node maintenance/scripts/agent-eval/eval.ts setup  --work <dir>
//   node maintenance/scripts/agent-eval/eval.ts run    --work <dir> --out <dir> --token-file <file>
//   node maintenance/scripts/agent-eval/eval.ts report --work <dir> --out <dir>
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import {
  renderRules,
  renderSkill,
  skillFile,
} from '../../../packages/nestjs-endpoints/dist/agent-files.js';
import { segments } from './guard.ts';

const repo = path.join(import.meta.dirname, '../../..');
const library = path.join(repo, 'packages/nestjs-endpoints');

const { values: opts, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    work: { type: 'string' },
    out: { type: 'string' },
    'token-file': { type: 'string' },
    layouts: { type: 'string' },
    setups: { type: 'string' },
    reps: { type: 'string', default: '3' },
    concurrency: { type: 'string', default: '4' },
    model: { type: 'string', default: 'sonnet' },
  },
});

const need = (name: 'work' | 'out'): string => {
  const value = opts[name];
  if (!value) {
    console.error(`eval: --${name} <dir> is required`);
    process.exit(2);
  }
  return path.resolve(value);
};

// ── the repos ─────────────────────────────────────────────────────────────────────────────────

/** The files of an app, by path: a Nest API with an `orders` or a `users` folder of endpoints. */
function app(name: string, resource: 'orders' | 'users'): Record<string, string> {
  const Service = resource === 'orders' ? 'OrdersService' : 'UsersService';
  const service = `${resource}.service`;
  return {
    'package.json': JSON.stringify(
      {
        name,
        private: true,
        type: 'module',
        scripts: { build: 'nest build', start: 'nest start', 'start:dev': 'nest start --watch' },
        dependencies: {
          '@nestjs/common': '^12.4.0',
          '@nestjs/core': '^12.4.0',
          '@nestjs/platform-express': '^12.4.0',
          'nestjs-endpoints': '^3.0.0',
          zod: '^4.6.7',
        },
        devDependencies: { '@nestjs/cli': '^12.0.0', typescript: '^6.0.3' },
      },
      null,
      2,
    ),
    'src/main.ts': `import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

const app = await NestFactory.create(AppModule);
await app.listen(process.env.PORT ?? 3000);
`,
    'src/app.module.ts': `import { Module } from '@nestjs/common';
import { NestjsEndpoints } from 'nestjs-endpoints';
import { ${Service} } from './endpoints/${resource}/${service}.js';

@Module({
  imports: [
    NestjsEndpoints.forRoot({
      router: { rootDirectory: './endpoints', providers: [${Service}] },
    }),
  ],
})
export class AppModule {}
`,
    [`src/endpoints/${resource}/${service}.ts`]: `import { Injectable } from '@nestjs/common';

@Injectable()
export class ${Service} {
  private readonly items = new Map<number, { id: number; name: string; active: boolean }>();

  list() {
    return [...this.items.values()];
  }

  create(name: string) {
    const item = { id: this.items.size + 1, name, active: true };
    this.items.set(item.id, item);
    return item;
  }
}
`,
    [`src/endpoints/${resource}/list.endpoint.ts`]: `import { endpoint, z } from 'nestjs-endpoints';
import { ${Service} } from './${service}.js';

export default endpoint.query({
  output: z.array(z.object({ id: z.number(), name: z.string(), active: z.boolean() })),
  inject: { ${resource}: ${Service} },
  handler: ({ ${resource} }) => ${resource}.list(),
});
`,
    [`src/endpoints/${resource}/create.endpoint.ts`]: `import { endpoint, z } from 'nestjs-endpoints';
import { ${Service} } from './${service}.js';

export default endpoint.mutation({
  input: z.object({ name: z.string() }),
  output: z.object({ id: z.number(), name: z.string(), active: z.boolean() }),
  inject: { ${resource}: ${Service} },
  handler: ({ input, ${resource} }) => ${resource}.create(input.name),
});
`,
  };
}

/**
 * An API the way one tends to be written without guidance: every id in a request body, no
 * `params`, one router at the root, and a service behind every handler. Seven endpoints over
 * projects and their tasks, three of them on a task.
 */
function rudimentary(): Record<string, string> {
  const files: Record<string, string> = {
    ...app('projects-api', 'orders'),
    'src/app.module.ts': `import { Module } from '@nestjs/common';
import { NestjsEndpoints } from 'nestjs-endpoints';
import { ProjectsService } from './endpoints/projects/projects.service.js';

@Module({
  imports: [
    NestjsEndpoints.forRoot({
      router: { rootDirectory: './endpoints', providers: [ProjectsService] },
    }),
  ],
})
export class AppModule {}
`,
    'src/endpoints/projects/projects.service.ts': `import { Injectable, NotFoundException } from '@nestjs/common';

export type Task = { id: number; title: string; done: boolean };
export type Project = { id: string; name: string; tasks: Task[] };

@Injectable()
export class ProjectsService {
  private readonly projects = new Map<string, Project>();

  list() {
    return [...this.projects.values()].map(({ id, name }) => ({ id, name }));
  }

  create(name: string) {
    const project = { id: crypto.randomUUID(), name, tasks: [] };
    this.projects.set(project.id, project);
    return { id: project.id, name };
  }

  view(projectId: string) {
    const project = this.projects.get(projectId);
    if (!project) {
      throw new NotFoundException();
    }
    return project;
  }

  rename(projectId: string, name: string) {
    this.view(projectId).name = name;
    return { id: projectId, name };
  }

  listTasks(projectId: string) {
    return this.view(projectId).tasks;
  }

  createTask(projectId: string, title: string) {
    const tasks = this.view(projectId).tasks;
    const task = { id: tasks.length + 1, title, done: false };
    tasks.push(task);
    return task;
  }

  completeTask(projectId: string, taskId: number) {
    const task = this.view(projectId).tasks.find((one) => one.id === taskId);
    if (!task) {
      throw new NotFoundException();
    }
    task.done = true;
    return task;
  }
}
`,
  };
  delete files['src/endpoints/orders/orders.service.ts'];
  delete files['src/endpoints/orders/list.endpoint.ts'];
  delete files['src/endpoints/orders/create.endpoint.ts'];
  const project = 'z.object({ id: z.string(), name: z.string() })';
  const task = 'z.object({ id: z.number(), title: z.string(), done: z.boolean() })';
  const endpoints: [string, 'query' | 'mutation', string, string, string][] = [
    ['list', 'query', '', `z.array(${project})`, 'projects.list()'],
    ['create', 'mutation', '{ name: z.string() }', project, 'projects.create(input.name)'],
    ['view', 'query', '{ projectId: z.string() }', `${project}.extend({ tasks: z.array(${task}) })`, 'projects.view(input.projectId)'],
    ['rename', 'mutation', '{ projectId: z.string(), name: z.string() }', project, 'projects.rename(input.projectId, input.name)'],
    ['tasks/list', 'query', '{ projectId: z.string() }', `z.array(${task})`, 'projects.listTasks(input.projectId)'],
    ['tasks/create', 'mutation', '{ projectId: z.string(), title: z.string() }', task, 'projects.createTask(input.projectId, input.title)'],
    ['tasks/complete', 'mutation', '{ projectId: z.string(), taskId: z.number() }', task, 'projects.completeTask(input.projectId, input.taskId)'],
  ]; // oxfmt-ignore
  for (const [name, kind, input, output, call] of endpoints) {
    const up = name.includes('/') ? '../' : './';
    files[`src/endpoints/projects/${name}.endpoint.ts`] =
      `import { endpoint, z } from 'nestjs-endpoints';
import { ProjectsService } from '${up}projects.service.js';

export default endpoint.${kind}({
${input ? `  input: z.object(${input}),\n` : ''}  output: ${output},
  inject: { projects: ProjectsService },
  handler: (${input ? '{ input, projects }' : '{ projects }'}) => ${call},
});
`;
  }
  return files;
}

/** A file the agent tried to write: its path from the repo's root, and what it held. */
interface Written {
  path: string;
  content: string;
}

/** A task: what a person would type, naming neither the library nor its docs. */
interface Task {
  prompt: string;
  /** The `llms.txt` the agent should read, from the repo's root: the copy that API installed. */
  docs: string;
  /**
   * Whether what the agent tried to write follows the recommended architecture. A task with
   * one lets the run go on past its first write, and is graded on every write it tried.
   */
  wrote?: (files: Written[]) => boolean;
}

const isEndpoint = (file: Written) => /(^|\/)([^/]*\.)?endpoint\.ts$/.test(file.path);
/** An endpoint file whose path has each `$param`. */
const hasInPath = (file: Written, names: string[]) =>
  isEndpoint(file) && names.every((name) => file.path.includes(`$${name}`));
/** A file that takes none of `names` in its body. */
const noneInInput = (file: Written, names: string[]) =>
  !names.some((name) =>
    new RegExp(`input:\\s*z\\.object\\(\\{[^}]*\\b${name}\\b`).test(file.content),
  );
/** An endpoint file whose path has each `$param`, that declares `params`, and takes none in its body. */
const inPath =
  (...names: string[]) =>
  (files: Written[]) =>
    files.some(
      (file) =>
        hasInPath(file, names) && file.content.includes('params:') && noneInInput(file, names),
    );
/** The files `rudimentary()` seeds: editing one of them is not adding one. */
const seeded = rudimentary();

/**
 * A layout: a repo as a package manager leaves it. `files` are its own files; `copies` are where
 * the built package is installed, with the version each says it is; `links` are symlinks, from
 * the repo's root, as pnpm and npm workspaces make them.
 */
interface Layout {
  files: Record<string, string>;
  copies: Record<string, string>;
  links: Record<string, string>;
  tasks: Record<string, Task>;
}

const prefixed = (prefix: string, files: Record<string, string>) =>
  Object.fromEntries(Object.entries(files).map(([file, text]) => [`${prefix}/${file}`, text]));

const PNPM_COPY = 'node_modules/.pnpm/nestjs-endpoints@3.0.0/node_modules/nestjs-endpoints';

const layouts: Record<string, Layout> = {
  // One API at the root, installed by any package manager.
  single: {
    files: app('shop-api', 'orders'),
    copies: { 'node_modules/nestjs-endpoints': '3.0.0' },
    links: {},
    tasks: {
      'add-endpoint': {
        prompt: 'Add an endpoint that returns one order by its id.',
        docs: 'node_modules/nestjs-endpoints/docs/llms.txt',
        wrote: inPath('orderId'),
      },
      'query-param': {
        prompt: 'Let the orders list take a page number in its query string.',
        docs: 'node_modules/nestjs-endpoints/docs/llms.txt',
      },
    },
  },
  // One API written without guidance (`rudimentary()`), graded on what the agent writes: whether
  // a new endpoint follows the recommended architecture where its neighbours don't.
  rudimentary: {
    files: rudimentary(),
    copies: { 'node_modules/nestjs-endpoints': '3.1.0' },
    links: {},
    tasks: {
      'archive-project': {
        prompt: 'Add an endpoint that archives a project.',
        docs: 'node_modules/nestjs-endpoints/docs/llms.txt',
        // A new service fails it; the seeded one holds the projects, so editing it doesn't.
        wrote: (files) =>
          inPath('projectId')(files) &&
          !files.some((file) => file.path.endsWith('.service.ts') && !(file.path in seeded)),
      },
      'rename-task': {
        prompt: 'Add an endpoint that renames a task in a project.',
        docs: 'node_modules/nestjs-endpoints/docs/llms.txt',
        // Both ids in its path and neither in its body, with `params` declared by the endpoint
        // or by a router it wrote in a folder above it.
        wrote: (files) =>
          files.some(
            (file) =>
              hasInPath(file, ['projectId', 'taskId']) &&
              noneInInput(file, ['projectId', 'taskId']) &&
              (file.content.includes('params:') ||
                files.some(
                  (router) =>
                    /(^|\/)router\.ts$/.test(router.path) &&
                    file.path.startsWith(router.path.replace(/router\.ts$/, '')) &&
                    router.content.includes('params'),
                )),
          ),
      },
      'health-check': {
        prompt: 'Add a health check endpoint the load balancer can call.',
        docs: 'node_modules/nestjs-endpoints/docs/llms.txt',
        wrote: (files) =>
          files.some((file) => isEndpoint(file) && /method:\s*['"]get['"]/.test(file.content)),
      },
    },
  },
  // Two APIs in a pnpm workspace: each links the package from pnpm's store, and nothing is at
  // the root's node_modules/nestjs-endpoints.
  'pnpm-monorepo': {
    files: {
      'package.json': JSON.stringify({ name: 'platform', private: true }, null, 2),
      'pnpm-workspace.yaml': "packages:\n  - 'apps/*'\n",
      ...prefixed('apps/shop', app('shop', 'orders')),
      ...prefixed('apps/admin', app('admin', 'users')),
    },
    copies: { [PNPM_COPY]: '3.0.0' },
    links: {
      'apps/shop/node_modules/nestjs-endpoints': PNPM_COPY,
      'apps/admin/node_modules/nestjs-endpoints': PNPM_COPY,
    },
    tasks: {
      'admin-endpoint': {
        prompt: 'In the admin API, add an endpoint that deactivates a user.',
        docs: `${PNPM_COPY}/docs/llms.txt`,
      },
      'shop-endpoint': {
        prompt: 'In the shop API, add an endpoint that cancels an order.',
        docs: `${PNPM_COPY}/docs/llms.txt`,
      },
    },
  },
  // Two APIs in an npm workspace on different versions: the shop's is hoisted to the root, and
  // the admin API has a copy of its own.
  'npm-two-versions': {
    files: {
      'package.json': JSON.stringify(
        { name: 'platform', private: true, workspaces: ['apps/*'] },
        null,
        2,
      ),
      ...prefixed('apps/shop', app('shop', 'orders')),
      ...prefixed('apps/admin', app('admin', 'users')),
    },
    copies: {
      'node_modules/nestjs-endpoints': '3.0.0',
      'apps/admin/node_modules/nestjs-endpoints': '3.1.0',
    },
    links: { 'node_modules/shop': 'apps/shop', 'node_modules/admin': 'apps/admin' },
    tasks: {
      'admin-endpoint': {
        prompt: 'In the admin API, add an endpoint that deactivates a user.',
        docs: 'apps/admin/node_modules/nestjs-endpoints/docs/llms.txt',
      },
      'shop-endpoint': {
        prompt: 'In the shop API, add an endpoint that cancels an order.',
        docs: 'node_modules/nestjs-endpoints/docs/llms.txt',
      },
    },
  },
};

const RULES = '.claude/rules/nestjs-endpoints.md';
const SKILL = '.claude/skills/nestjs-endpoints/SKILL.md';

/** What each setup puts in the repo: the agent files as the postinstall writes them, or one of them. */
const setups: Record<string, (version: string) => Record<string, string>> = {
  installed: (version) => ({
    [RULES]: renderRules(version),
    [SKILL]: renderSkill(version),
    [skillFile('nestjs-endpoints-refactor')]: renderSkill(version, 'nestjs-endpoints-refactor'),
  }),
  skill: (version) => ({ [SKILL]: renderSkill(version) }),
  rules: (version) => ({ [RULES]: renderRules(version) }),
};

const caseDir = (work: string, layout: string, setup: string) =>
  path.join(work, `${layout}--${setup}`);

function write(file: string, text: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

/** The built package, as an install leaves it, saying it is `version`. */
function installCopy(at: string, version: string): void {
  if (!fs.existsSync(path.join(library, 'docs/llms.txt'))) {
    console.error(
      'eval: packages/nestjs-endpoints/docs/llms.txt is missing. Run `pnpm build` first.',
    );
    process.exit(1);
  }
  for (const entry of ['dist', 'docs', 'skills', 'assets']) {
    fs.cpSync(path.join(library, entry), path.join(at, entry), { recursive: true });
  }
  const pkg = JSON.parse(fs.readFileSync(path.join(library, 'package.json'), 'utf8'));
  write(path.join(at, 'package.json'), `${JSON.stringify({ ...pkg, version }, null, 2)}\n`);
}

function setup(work: string): void {
  if (fs.existsSync(work) && fs.readdirSync(work).length > 0) {
    console.error(`eval: ${work} is not empty`);
    process.exit(2);
  }
  const version = JSON.parse(fs.readFileSync(path.join(library, 'package.json'), 'utf8')).version;
  for (const [name, layout] of Object.entries(layouts)) {
    for (const [setupName, files] of Object.entries(setups)) {
      const dir = caseDir(work, name, setupName);
      const root = path.join(dir, 'repo');
      for (const [file, text] of Object.entries({ ...layout.files, ...files(version) })) {
        write(path.join(root, file), text);
      }
      for (const [at, copyVersion] of Object.entries(layout.copies)) {
        installCopy(path.join(root, at), copyVersion);
      }
      for (const [link, target] of Object.entries(layout.links)) {
        const from = path.join(root, link);
        fs.mkdirSync(path.dirname(from), { recursive: true });
        fs.symlinkSync(path.relative(path.dirname(from), path.join(root, target)), from);
      }
      // A home of its own: no user skills, instructions or memory.
      fs.mkdirSync(path.join(dir, 'home/.claude-config'), { recursive: true });
    }
  }
  console.log(
    `setup: ${Object.keys(layouts).length * Object.keys(setups).length} repos in ${work}`,
  );
}

// ── a run ─────────────────────────────────────────────────────────────────────────────────────

interface Step {
  tool: string;
  /** A Bash command, a file path, or a skill's name. */
  text: string;
  /** What a Write puts in its file, or an Edit's new text. */
  content: string;
}

function stepsOf(file: string): Step[] {
  const steps: Step[] = [];
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    let event: { type?: string; message?: { content?: unknown } };
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    const content = event.type === 'assistant' ? event.message?.content : undefined;
    for (const part of Array.isArray(content) ? content : []) {
      if (part?.type === 'tool_use') {
        const input = part.input ?? {};
        const text = input.command ?? input.file_path ?? input.skill ?? input.pattern ?? '';
        const content =
          input.content ??
          input.new_string ??
          (Array.isArray(input.edits)
            ? input.edits.map((edit: { new_string?: string }) => edit.new_string ?? '').join('\n')
            : '');
        steps.push({
          tool: part.name ?? '',
          text: typeof text === 'string' ? text : '',
          content: typeof content === 'string' ? content : '',
        });
      }
    }
  }
  return steps;
}

const ACTS = /^(Write|Edit|MultiEdit)$/;

/** Every file the steps tried to write, by its path from the repo's root. */
function writesOf(root: string, steps: Step[]): Written[] {
  return steps
    .filter((step) => ACTS.test(step.tool))
    .map((step) => ({
      path: path.relative(root, path.resolve(root, step.text)).split(path.sep).join('/'),
      content: step.content,
    }));
}

interface Job {
  layout: string;
  setup: string;
  task: string;
  rep: number;
  file: string;
}

function token(): string {
  const file = opts['token-file'];
  const value = file
    ? fs.readFileSync(path.resolve(file), 'utf8').trim()
    : process.env.CLAUDE_CODE_OAUTH_TOKEN;
  if (!value) {
    console.error(
      'eval: pass --token-file <file> (from `claude setup-token`) or set CLAUDE_CODE_OAUTH_TOKEN',
    );
    process.exit(2);
  }
  return value;
}

function runJob(work: string, job: Job, oauth: string): Promise<string> {
  const dir = caseDir(work, job.layout, job.setup);
  const home = path.join(dir, 'home');
  const realHome = os.homedir();
  // The developer's own instructions are found through their real home, whatever HOME says.
  const excludes = [`${realHome}/.claude/**`];
  for (const link of [`${realHome}/.claude/CLAUDE.md`, `${realHome}/.claude/rules`]) {
    try {
      excludes.push(`${path.dirname(fs.readlinkSync(link))}/**`);
    } catch {
      // not a link
    }
  }
  const settings = {
    claudeMdExcludes: excludes,
    hooks: {
      PreToolUse: [
        {
          matcher: 'Bash',
          hooks: [
            { type: 'command', command: `node ${path.join(import.meta.dirname, 'guard.ts')}` },
          ],
        },
      ],
    },
  };
  fs.mkdirSync(path.dirname(job.file), { recursive: true });
  const out = fs.createWriteStream(job.file);
  const child = spawn(
    'claude',
    [
      '--no-session-persistence',
      '--settings', JSON.stringify(settings),
      '--model', opts.model!,
      '-p', layouts[job.layout]!.tasks[job.task]!.prompt,
      '--output-format', 'stream-json',
      '--verbose',
      '--max-turns', '30',
      '--allowedTools', 'Read', 'Glob', 'Grep', 'Skill',
      '--disallowedTools', 'WebFetch', 'WebSearch', 'Task', 'Agent', 'NotebookEdit',
    ], // oxfmt-ignore
    {
      cwd: path.join(dir, 'repo'),
      env: {
        PATH: process.env.PATH,
        LANG: 'en_US.UTF-8',
        HOME: home,
        CLAUDE_CONFIG_DIR: path.join(home, '.claude-config'),
        CLAUDE_CODE_OAUTH_TOKEN: oauth,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  const gradesWrites = layouts[job.layout]!.tasks[job.task]!.wrote !== undefined;
  return new Promise((resolve) => {
    let stopped = 'exit';
    let buffer = '';
    const stop = (why: string) => {
      if (stopped === 'exit') {
        stopped = why;
        child.kill('SIGTERM');
      }
    };
    const timer = setTimeout(() => stop('timeout'), 240_000);
    child.stdout.on('data', (chunk: Buffer) => {
      out.write(chunk);
      buffer += chunk.toString('utf8');
      // What the agent read before it acted is what is graded: once it tries to write a file,
      // the run has said what it can. A task graded on what it writes runs to its end instead.
      if (!gradesWrites && /"name":"(Write|Edit|MultiEdit)"/.test(buffer)) {
        setTimeout(() => stop('acted'), 3000);
      }
      buffer = buffer.slice(buffer.lastIndexOf('\n') + 1);
    });
    child.stderr.on('data', (chunk: Buffer) => fs.appendFileSync(`${job.file}.stderr`, chunk));
    child.on('close', () => {
      clearTimeout(timer);
      out.end();
      fs.writeFileSync(
        job.file.replace(/\.jsonl$/, '.json'),
        `${JSON.stringify({ ...job, stopped })}\n`,
      );
      resolve(stopped);
    });
  });
}

// ── grading ───────────────────────────────────────────────────────────────────────────────────

interface Grade {
  skill: boolean;
  resolved: boolean;
  /** Read the `llms.txt` of the API's version, before it acted. */
  rightDocs: boolean;
  /** Read another copy's `llms.txt` before its API's own, or instead of it. */
  wrongFirst: boolean;
  playbook: boolean;
  /** Read the Recommended architecture page of that copy, before it acted. */
  architecture: boolean;
  acted: boolean;
  /**
   * What it tried to write follows the recommended architecture: `null` for a task not graded
   * on it, or a run that tried to write no endpoint file.
   */
  wroteRight: boolean | null;
}

/** The real path of a file a step names, from the repo's root, or `null` when there is none. */
function real(root: string, file: string): string | null {
  try {
    return fs.realpathSync(path.resolve(root, file));
  } catch {
    return null;
  }
}

/** The files a step reads: a Read, or what a `cat`, `head`, `tail` or `less` names, from where `cd`s left it. */
function readsOf(root: string, step: Step): string[] {
  if (step.tool === 'Read') {
    return [path.resolve(root, step.text)];
  }
  if (step.tool !== 'Bash') {
    return [];
  }
  let cwd = root;
  const files: string[] = [];
  for (const segment of segments(step.text) ?? step.text.split(/[;&|\n]+/)) {
    const words = segment
      .trim()
      .split(/\s+/)
      .map((word) => word.replaceAll(/['"]/g, ''));
    if (words[0] === 'cd' && words[1]) {
      cwd = path.resolve(cwd, words[1]);
    } else if (/^(cat|head|tail|less)$/.test(words[0] ?? '')) {
      // the files it names: not its flags, nor the count after `-n`
      const args = words
        .slice(1)
        .filter((word, at, all) => !word.startsWith('-') && !/^-[nc]$/.test(all[at - 1] ?? ''));
      files.push(...args.map((file) => path.resolve(cwd, file)));
    }
  }
  return files;
}

function grade(work: string, job: Job): Grade {
  const root = path.join(caseDir(work, job.layout, job.setup), 'repo');
  const steps = stepsOf(job.file);
  const firstAct = steps.findIndex((step) => ACTS.test(step.tool));
  const before = firstAct === -1 ? steps : steps.slice(0, firstAct);
  const task = layouts[job.layout]!.tasks[job.task]!;
  const written = writesOf(root, steps);
  const expected = real(root, task.docs);
  const read = before.flatMap((step) => readsOf(root, step)).map((file) => real(root, file));
  const llms = read.filter(
    (file): file is string => file?.endsWith(`${path.sep}llms.txt`) ?? false,
  );
  return {
    skill: before.some((step) => step.tool === 'Skill' && step.text.includes('nestjs-endpoints')),
    resolved: before.some(
      (step) =>
        step.tool === 'Bash' &&
        /require\.resolve\(.nestjs-endpoints\/docs\/llms\.txt.\)/.test(step.text),
    ),
    rightDocs: llms.includes(expected!),
    wrongFirst: llms.length > 0 && llms[0] !== expected,
    playbook: read.some(
      (file) => file !== null && file === path.join(path.dirname(expected!), 'ai/playbook.md'),
    ),
    architecture: read.some(
      (file) =>
        file !== null && file === path.join(path.dirname(expected!), 'guide/architecture.md'),
    ),
    acted: firstAct !== -1,
    // A run that tried no endpoint file, say one whose refused edit to a service ended it, wrote
    // nothing to grade.
    wroteRight: task.wrote && written.some(isEndpoint) ? task.wrote(written) : null,
  };
}

function jobsIn(outDir: string): Job[] {
  const jobs: Job[] = [];
  for (const [layout, def] of Object.entries(layouts)) {
    for (const setupName of Object.keys(setups)) {
      for (const task of Object.keys(def.tasks)) {
        const dir = path.join(outDir, `${layout}--${setupName}`, task);
        for (const name of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
          if (name.endsWith('.json')) {
            jobs.push({ layout, setup: setupName, task, rep: Number(name.slice(0, -5)), file: path.join(dir, name.replace(/\.json$/, '.jsonl')) }); // oxfmt-ignore
          }
        }
      }
    }
  }
  return jobs;
}

function report(work: string, outDir: string): void {
  const rows = jobsIn(outDir).map((job) => ({ ...job, ...grade(work, job) }));
  const keys = [
    'skill',
    'resolved',
    'rightDocs',
    'wrongFirst',
    'playbook',
    'architecture',
    'acted',
  ] as const;
  const lines = [
    '| Layout | Setup | Task | Runs | Loaded the skill | Ran the resolve command | Read its API’s llms.txt | Read another copy’s first | Read the playbook | Read the architecture page | Went on to write | Wrote it the recommended way | Wrote nothing |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ];
  const groups = Map.groupBy(rows, (row) => `${row.layout}|${row.setup}|${row.task}`);
  for (const [group, runs] of [...groups].toSorted(([a], [b]) => a.localeCompare(b))) {
    const counts = keys.map((key) => `${runs.filter((run) => run[key]).length}/${runs.length}`);
    // Over the runs that wrote something, for a task graded on it.
    const gradesWrites = layouts[runs[0]!.layout]!.tasks[runs[0]!.task]!.wrote !== undefined;
    const wrote = runs.filter((run) => run.wroteRight !== null);
    const right = gradesWrites
      ? `${wrote.filter((run) => run.wroteRight).length}/${wrote.length}`
      : '–';
    const nothing = gradesWrites ? `${runs.length - wrote.length}` : '–';
    lines.push(
      `| ${group.split('|').join(' | ')} | ${runs.length} | ${counts.join(' | ')} | ${right} | ${nothing} |`,
    );
  }
  fs.writeFileSync(path.join(outDir, 'report.md'), `${lines.join('\n')}\n`);
  fs.writeFileSync(path.join(outDir, 'results.json'), `${JSON.stringify(rows, null, 2)}\n`);
  console.log(lines.join('\n'));
}

async function run(work: string, outDir: string): Promise<void> {
  const oauth = token();
  const wantedLayouts = opts.layouts ? opts.layouts.split(',') : Object.keys(layouts);
  const wantedSetups = opts.setups ? opts.setups.split(',') : Object.keys(setups);
  const jobs: Job[] = [];
  for (let rep = 1; rep <= Number(opts.reps); rep++) {
    for (const layout of wantedLayouts) {
      for (const setupName of wantedSetups) {
        for (const task of Object.keys(layouts[layout]!.tasks)) {
          const file = path.join(outDir, `${layout}--${setupName}`, task, `${rep}.jsonl`);
          if (!fs.existsSync(file.replace(/\.jsonl$/, '.json'))) {
            jobs.push({ layout, setup: setupName, task, rep, file });
          }
        }
      }
    }
  }
  console.log(`run: ${jobs.length} runs`);
  let next = 0;
  let done = 0;
  const worker = async () => {
    for (let job = jobs[next++]; job; job = jobs[next++]) {
      const stopped = await runJob(work, job, oauth);
      const g = grade(work, job);
      const marks = Object.entries(g)
        .filter(([, on]) => on)
        .map(([key]) => key);
      console.log(`[${++done}/${jobs.length}] ${job.layout} ${job.setup} ${job.task} #${job.rep} (${stopped}): ${marks.join(', ') || 'nothing'}`); // oxfmt-ignore
    }
  };
  await Promise.all(Array.from({ length: Number(opts.concurrency) }, worker));
  report(work, outDir);
}

switch (positionals[0]) {
  case 'setup':
    setup(need('work'));
    break;
  case 'run':
    await run(need('work'), need('out'));
    break;
  case 'report':
    report(need('work'), need('out'));
    break;
  default:
    console.error(
      'usage: eval.ts setup|run|report --work <dir> [--out <dir>] [--token-file <file>]',
    );
    process.exit(2);
}
