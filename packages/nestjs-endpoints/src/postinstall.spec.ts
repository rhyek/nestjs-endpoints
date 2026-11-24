import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RULES_FILE, SKILL_FILE, skillFile } from './agent-files';
import { runPostinstall } from './postinstall';

let base: string;
let checkout: string;
let installed: string;
let lines: string[];

beforeEach(() => {
  base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ne-postinstall-')));
  checkout = path.join(base, 'repo');
  fs.mkdirSync(path.join(checkout, '.git'), { recursive: true });
  installed = path.join(
    checkout,
    'node_modules',
    '.pnpm',
    'nestjs-endpoints@3.0.0',
    'node_modules',
    'nestjs-endpoints',
  );
  fs.mkdirSync(installed, { recursive: true });
  lines = [];
});

afterEach(() => {
  fs.rmSync(base, { recursive: true, force: true });
});

function postinstall(env: Record<string, string | undefined>, packageDir = installed) {
  runPostinstall({ packageDir, env, version: '3.0.0', write: (line) => lines.push(line) });
}

const has = (file: string) => fs.existsSync(path.join(checkout, file));

test('writes the agent files into the checkout the install ran in, and says so', () => {
  postinstall({ INIT_CWD: checkout });
  expect(has(RULES_FILE)).toBe(true);
  expect(has(SKILL_FILE)).toBe(true);
  expect(has(skillFile('nestjs-endpoints-refactor'))).toBe(true);
  expect(lines).toEqual([
    `nestjs-endpoints: updated the coding-agent files: ${RULES_FILE}, ${SKILL_FILE}, ${skillFile('nestjs-endpoints-refactor')}`,
  ]);
});

test('says nothing when the files are current', () => {
  postinstall({ INIT_CWD: checkout });
  lines = [];
  postinstall({ INIT_CWD: checkout });
  expect(lines).toEqual([]);
});

// A monorepo's install that ran in the API's package still writes at the repository's root,
// where Claude Code reads `.claude/`.
test('writes at the root of the checkout when the install ran in a package inside it', () => {
  const api = path.join(checkout, 'apps', 'api');
  const inApi = path.join(api, 'node_modules', 'nestjs-endpoints');
  fs.mkdirSync(inApi, { recursive: true });
  postinstall({ INIT_CWD: api }, inApi);
  expect(has(RULES_FILE)).toBe(true);
  expect(fs.existsSync(path.join(api, '.claude'))).toBe(false);
});

test.each([
  ['in CI', { CI: 'true' }],
  ['when NESTJS_ENDPOINTS_SKIP_AGENT_FILES is set', { NESTJS_ENDPOINTS_SKIP_AGENT_FILES: '1' }],
])('writes nothing %s', (_, env) => {
  postinstall({ INIT_CWD: checkout, ...env });
  expect(has('.claude')).toBe(false);
});

test('runs when CI is set to false', () => {
  postinstall({ INIT_CWD: checkout, CI: 'false' });
  expect(has(RULES_FILE)).toBe(true);
});

test('writes nothing without INIT_CWD', () => {
  postinstall({});
  expect(has('.claude')).toBe(false);
});

// A deployment's install, such as in a Docker build, has no checkout.
test('writes nothing outside a git checkout', () => {
  fs.rmSync(path.join(checkout, '.git'), { recursive: true });
  postinstall({ INIT_CWD: checkout });
  expect(has('.claude')).toBe(false);
});

// The package's own workspace, a link to the package's sources, and a global install.
test("writes nothing when the package is not under the project's node_modules", () => {
  const sources = path.join(checkout, 'packages', 'nestjs-endpoints');
  const global = path.join(base, 'global', 'node_modules', 'nestjs-endpoints');
  fs.mkdirSync(sources, { recursive: true });
  fs.mkdirSync(global, { recursive: true });
  postinstall({ INIT_CWD: checkout }, sources);
  postinstall({ INIT_CWD: checkout }, global);
  expect(has('.claude')).toBe(false);
  expect(lines).toEqual([]);
});

test('reports a failure in one line, and never throws', () => {
  fs.writeFileSync(path.join(checkout, '.claude'), 'a file where the folder goes');
  expect(() => postinstall({ INIT_CWD: checkout })).not.toThrow();
  expect(lines).toHaveLength(1);
  expect(lines[0]).toMatch(/^nestjs-endpoints: could not write the coding-agent files \(/);
});
