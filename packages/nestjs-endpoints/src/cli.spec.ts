import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

// The command as it is installed: the built `dist/cli.js`.
const cli = path.resolve(import.meta.dirname, '../dist/cli.js');

/** Every file under `dir`, relative to it, sorted. */
function filesIn(dir: string): string[] {
  return fs
    .readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(dir, path.join(entry.parentPath, entry.name)))
    .sort();
}

let project: string;

beforeEach(() => {
  project = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ne-cli-')));
  fs.mkdirSync(path.join(project, 'src/endpoints'), { recursive: true });
  fs.writeFileSync(path.join(project, 'src/endpoints/a.endpoint.ts'), '');
  fs.writeFileSync(path.join(project, '.prettierrc'), '{}');
});

test('`init` installs the agent skill, and writes nothing else into the project', async () => {
  const { stdout } = await run(process.execPath, [cli, 'init'], { cwd: project });

  expect(stdout).toMatch(/Installed agent skill/);
  expect(filesIn(project)).toEqual([
    '.claude/skills/nestjs-endpoints/SKILL.md',
    '.prettierrc',
    'node_modules/.nestjs-endpoints/skill.json',
    'src/endpoints/a.endpoint.ts',
  ]);
});

test('there is no `generate` command', async () => {
  await expect(run(process.execPath, [cli, 'generate'], { cwd: project })).rejects.toMatchObject({
    code: 1,
    stderr: expect.stringMatching(/Unknown command: generate/),
  });
  expect(filesIn(project)).toEqual(['.prettierrc', 'src/endpoints/a.endpoint.ts']);
});

test('`help` lists `init` and nothing about a manifest', async () => {
  const { stdout } = await run(process.execPath, [cli, 'help'], { cwd: project });

  expect(stdout).toMatch(/init\s+Install the agent skill/);
  expect(stdout).not.toMatch(/manifest|generate/);
});
