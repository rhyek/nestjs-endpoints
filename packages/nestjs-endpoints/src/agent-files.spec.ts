import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  isOlder,
  renderRules,
  renderSkill,
  RULES_FILE,
  SKILL_FILE,
  SKILLS,
  skillFile,
  syncAgentFiles,
} from './agent-files';

const REFACTOR_FILE = skillFile('nestjs-endpoints-refactor');

let root: string;
let installed: string;

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ne-agent-files-')));
  installed = path.join(root, 'node_modules', 'nestjs-endpoints');
  for (const name of SKILLS) {
    fs.mkdirSync(path.join(installed, 'skills', name), { recursive: true });
  }
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

const at = (file: string) => path.join(root, file);
const read = (file: string) => fs.readFileSync(at(file), 'utf8');
const sync = (version: string) =>
  syncAgentFiles({ root, installed, version }).map((file) => path.relative(root, file));

describe('rendering', () => {
  test('the rules file opens with its banner, as an HTML comment, then the text', () => {
    const lines = renderRules('1.2.3').split('\n');
    expect(lines[0]).toMatch(/^<!-- nestjs-endpoints rules v1\.2\.3 sha256:[0-9a-f]{64} .* -->$/);
    expect(lines[1]).toBe('# nestjs-endpoints');
  });

  // Above the frontmatter, the banner would keep the YAML from being read at all, and the
  // skill would lose its `description`, which is what an agent picks it by.
  test('the skill keeps its frontmatter on line 1, with the banner inside it', () => {
    const lines = renderSkill('1.2.3').split('\n');
    expect(lines[0]).toBe('---');
    expect(lines[1]).toMatch(/^# nestjs-endpoints skill v1\.2\.3 sha256:[0-9a-f]{64} /);
    expect(lines[2]).toBe('name: nestjs-endpoints');
  });

  test('the refactor skill keeps its frontmatter on line 1, with the banner inside it', () => {
    const lines = renderSkill('1.2.3', 'nestjs-endpoints-refactor').split('\n');
    expect(lines[0]).toBe('---');
    expect(lines[1]).toMatch(/^# nestjs-endpoints-refactor skill v1\.2\.3 sha256:[0-9a-f]{64} /);
    expect(lines[2]).toBe('name: nestjs-endpoints-refactor');
  });

  // A rewrite of a whole API is never something an agent starts on its own.
  test('the refactor skill runs only when invoked', () => {
    expect(renderSkill('1.2.3', 'nestjs-endpoints-refactor')).toMatch(
      /^disable-model-invocation: true$/m,
    );
  });

  // The Agent Skills spec allows 1,024 characters; Claude Code's listing cuts at 1,536.
  test.each(SKILLS)("the %s skill's description fits in 1024 characters", (name) => {
    const description = /^description: (.*)$/m.exec(renderSkill('1.2.3', name))?.[1];
    expect(description).toBeDefined();
    expect(description!.length).toBeLessThanOrEqual(1024);
  });

  test('the refactor skill finds the docs by resolving them, and names the architecture page', () => {
    const text = renderSkill('1.2.3', 'nestjs-endpoints-refactor');
    expect(text).toContain(`node -p "require.resolve('nestjs-endpoints/docs/llms.txt')"`);
    expect(text).toContain('guide/architecture.md');
  });

  test.each([
    ['rules file', renderRules],
    ['skill', renderSkill],
  ])('the %s finds the docs by resolving them, and falls back to the site', (_, render) => {
    const text = render('1.2.3');
    expect(text).toContain(`node -p "require.resolve('nestjs-endpoints/docs/llms.txt')"`);
    expect(text).toContain('https://nestjs-endpoints.dev/llms.txt');
  });
});

// The agent files have an agent find an API's docs as Node finds the package for that API, so
// they are right wherever the package manager put it.
describe('the docs resolve through the package exports', () => {
  /** Installs the package's `package.json` and a `docs/llms.txt` at `dir`. */
  function installAt(dir: string): string {
    fs.mkdirSync(path.join(dir, 'docs'), { recursive: true });
    fs.copyFileSync(
      path.join(import.meta.dirname, '../package.json'),
      path.join(dir, 'package.json'),
    );
    fs.writeFileSync(path.join(dir, 'docs', 'llms.txt'), '# nestjs-endpoints\n');
    return path.join(dir, 'docs', 'llms.txt');
  }

  /** What the command the agent files give prints, run from `dir`. */
  const resolveFrom = (dir: string) =>
    execFileSync(process.execPath, ['-p', "require.resolve('nestjs-endpoints/docs/llms.txt')"], {
      cwd: dir,
      encoding: 'utf8',
    }).trim();

  test('from an API whose copy is hoisted to the root', () => {
    const llms = installAt(installed);
    fs.mkdirSync(at('apps/api'), { recursive: true });
    expect(resolveFrom(at('apps/api'))).toBe(llms);
  });

  test('from an API with a copy of its own, another version', () => {
    installAt(installed);
    const own = installAt(at('apps/api/node_modules/nestjs-endpoints'));
    expect(resolveFrom(at('apps/api'))).toBe(own);
  });
});

test.each([
  ['1.2.3', '1.2.4', true],
  ['1.9.0', '1.10.0', true],
  ['2.0.0', '1.99.99', false],
  ['1.2.3', '1.2.3', false],
])('isOlder(%s, %s) is %s', (a, b, expected) => {
  expect(isOlder(a, b)).toBe(expected);
});

describe('syncAgentFiles', () => {
  test('writes the rules file and both skills into a repo that has none of them', () => {
    expect(sync('1.0.0')).toEqual([RULES_FILE, SKILL_FILE, REFACTOR_FILE]);
    expect(read(RULES_FILE)).toBe(renderRules('1.0.0'));
    expect(read(SKILL_FILE)).toBe(renderSkill('1.0.0'));
    expect(read(REFACTOR_FILE)).toBe(renderSkill('1.0.0', 'nestjs-endpoints-refactor'));
  });

  test('changes nothing when the files are current', () => {
    sync('1.0.0');
    expect(sync('1.0.0')).toEqual([]);
  });

  test('rewrites the files an older version wrote', () => {
    sync('1.0.0');
    expect(sync('1.1.0')).toEqual([RULES_FILE, SKILL_FILE, REFACTOR_FILE]);
    expect(read(RULES_FILE)).toBe(renderRules('1.1.0'));
    expect(read(SKILL_FILE)).toBe(renderSkill('1.1.0'));
    expect(read(REFACTOR_FILE)).toBe(renderSkill('1.1.0', 'nestjs-endpoints-refactor'));
  });

  test('leaves alone a file a newer version wrote', () => {
    sync('2.0.0');
    expect(sync('1.0.0')).toEqual([]);
    expect(read(RULES_FILE)).toBe(renderRules('2.0.0'));
  });

  test('leaves alone a file someone edited, and keeps the other current', () => {
    sync('1.0.0');
    fs.appendFileSync(at(RULES_FILE), 'Our own line.\n');
    expect(sync('1.1.0')).toEqual([SKILL_FILE, REFACTOR_FILE]);
    expect(read(RULES_FILE)).toBe(`${renderRules('1.0.0')}Our own line.\n`);
  });

  test('leaves alone a file of the same name that the package did not write', () => {
    fs.mkdirSync(path.dirname(at(SKILL_FILE)), { recursive: true });
    fs.writeFileSync(at(SKILL_FILE), '---\nname: nestjs-endpoints\n---\nOur own skill.\n');
    expect(sync('1.0.0')).toEqual([RULES_FILE, REFACTOR_FILE]);
    expect(read(SKILL_FILE)).toBe('---\nname: nestjs-endpoints\n---\nOur own skill.\n');
  });

  // Each skill's banner names it, so one skill's file is never taken for the other's.
  test("leaves alone the first skill's file where the refactor skill goes", () => {
    fs.mkdirSync(path.dirname(at(REFACTOR_FILE)), { recursive: true });
    fs.writeFileSync(at(REFACTOR_FILE), renderSkill('0.1.0'));
    expect(sync('1.0.0')).toEqual([RULES_FILE, SKILL_FILE]);
    expect(read(REFACTOR_FILE)).toBe(renderSkill('0.1.0'));
  });

  test('leaves alone a refactor skill of the same name that the package did not write', () => {
    const own = '---\nname: nestjs-endpoints-refactor\n---\nOur own refactor.\n';
    fs.mkdirSync(path.dirname(at(REFACTOR_FILE)), { recursive: true });
    fs.writeFileSync(at(REFACTOR_FILE), own);
    expect(sync('1.0.0')).toEqual([RULES_FILE, SKILL_FILE]);
    expect(read(REFACTOR_FILE)).toBe(own);
  });

  test('copies both skills into .agents/ and .cursor/ where those folders exist', () => {
    fs.mkdirSync(at('.cursor'));
    const cursorSkill = path.join('.cursor', 'skills', 'nestjs-endpoints', 'SKILL.md');
    const cursorRefactor = path.join('.cursor', 'skills', 'nestjs-endpoints-refactor', 'SKILL.md');
    expect(sync('1.0.0')).toEqual([
      RULES_FILE,
      SKILL_FILE,
      cursorSkill,
      REFACTOR_FILE,
      cursorRefactor,
    ]);
    expect(read(cursorSkill)).toBe(renderSkill('1.0.0'));
    expect(read(cursorRefactor)).toBe(renderSkill('1.0.0', 'nestjs-endpoints-refactor'));
    expect(fs.existsSync(at('.agents'))).toBe(false);
  });

  describe('where pnpm linked the skill', () => {
    beforeEach(() => {
      fs.mkdirSync(at('.claude/skills'), { recursive: true });
      fs.symlinkSync(
        path.join(installed, 'skills', 'nestjs-endpoints'),
        at('.claude/skills/pnpm-nestjs-endpoints-nestjs-endpoints'),
      );
    });

    test('writes no copy of its own', () => {
      sync('1.0.0');
      expect(fs.existsSync(at(SKILL_FILE))).toBe(false);
    });

    test('writes the refactor skill when pnpm linked only the first', () => {
      expect(sync('1.0.0')).toEqual([RULES_FILE, REFACTOR_FILE]);
    });

    test("removes the refactor skill's own copy where pnpm linked it", () => {
      fs.symlinkSync(
        path.join(installed, 'skills', 'nestjs-endpoints-refactor'),
        at('.claude/skills/pnpm-nestjs-endpoints-nestjs-endpoints-refactor'),
      );
      fs.mkdirSync(path.dirname(at(REFACTOR_FILE)), { recursive: true });
      fs.writeFileSync(at(REFACTOR_FILE), renderSkill('1.0.0', 'nestjs-endpoints-refactor'));
      expect(sync('1.0.0')).toEqual([RULES_FILE, REFACTOR_FILE]);
      expect(fs.existsSync(path.dirname(at(REFACTOR_FILE)))).toBe(false);
    });

    test('writes neither skill where pnpm linked both', () => {
      fs.symlinkSync(
        path.join(installed, 'skills', 'nestjs-endpoints-refactor'),
        at('.claude/skills/pnpm-nestjs-endpoints-nestjs-endpoints-refactor'),
      );
      expect(sync('1.0.0')).toEqual([RULES_FILE]);
      expect(fs.existsSync(at(REFACTOR_FILE))).toBe(false);
    });

    test("removes its own copy, if nobody edited it, so the skill isn't listed twice", () => {
      fs.mkdirSync(path.dirname(at(SKILL_FILE)), { recursive: true });
      fs.writeFileSync(at(SKILL_FILE), renderSkill('1.0.0'));
      expect(sync('1.0.0')).toEqual([RULES_FILE, SKILL_FILE, REFACTOR_FILE]);
      expect(fs.existsSync(path.dirname(at(SKILL_FILE)))).toBe(false);
    });

    test('keeps its own copy when someone edited it', () => {
      fs.mkdirSync(path.dirname(at(SKILL_FILE)), { recursive: true });
      fs.writeFileSync(at(SKILL_FILE), `${renderSkill('1.0.0')}Edited.\n`);
      expect(sync('1.0.0')).toEqual([RULES_FILE, REFACTOR_FILE]);
      expect(fs.existsSync(at(SKILL_FILE))).toBe(true);
    });
  });
});
