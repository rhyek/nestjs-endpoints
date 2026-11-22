import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/**
 * The files that tell a coding agent this repo's API is built with nestjs-endpoints, and point
 * it at the docs inside the installed package (`docs/llms.txt`), so it reads the version in
 * `node_modules`:
 *
 * - `.claude/rules/nestjs-endpoints.md`, a few lines Claude Code reads at the start of every
 *   session, whether the repo has a `CLAUDE.md` or not;
 * - the skill, `.claude/skills/nestjs-endpoints/SKILL.md`, for agents that load skills, and the
 *   same file under `.agents/` and `.cursor/` where those folders exist.
 *
 * Each file's first lines carry the version that wrote it and a hash of the rest, so the file
 * alone says whether it is out of date and whether anyone has edited it. A file someone edited,
 * or wrote themselves, is never touched.
 */

const packageDir = path.join(import.meta.dirname, '..');

export const RULES_FILE = path.join('.claude', 'rules', 'nestjs-endpoints.md');
export const SKILL_FILE = path.join('.claude', 'skills', 'nestjs-endpoints', 'SKILL.md');

/** Folders other agents read skills from: the skill is copied into each that exists. */
const OTHER_SKILL_ROOTS = ['.agents', '.cursor'];

const hash = (text: string) => crypto.createHash('sha256').update(text).digest('hex');

const TAIL = '— managed by the nestjs-endpoints package; do not edit';

/** A file the package writes: how it is rendered, and how its banner is read back. */
interface ManagedFile {
  render(version: string): string;
  /** The banner's version, and whether the rest still hashes to the banner's hash. */
  read(text: string): { version: string; unedited: boolean } | null;
}

/**
 * The rules file: its banner is an HTML comment on line 1, which Claude Code leaves out of what
 * it gives the model.
 */
const rules: ManagedFile = {
  render(version) {
    const body = `${fs.readFileSync(path.join(packageDir, 'assets/agent-rules.md'), 'utf8').trim()}\n`;
    return `<!-- nestjs-endpoints rules v${version} sha256:${hash(body)} ${TAIL} -->\n${body}`;
  },
  read(text) {
    const newline = text.indexOf('\n');
    const match = /^<!-- nestjs-endpoints rules v(\S+) sha256:([0-9a-f]{64}) .* -->$/.exec(
      newline === -1 ? text : text.slice(0, newline),
    );
    return match
      ? { version: match[1]!, unedited: hash(text.slice(newline + 1)) === match[2] }
      : null;
  },
};

/**
 * The skill: the package's `skills/nestjs-endpoints/SKILL.md`, where pnpm looks for a
 * dependency's skills, with the banner as a YAML comment on line 2. YAML frontmatter has to
 * start on line 1, or it isn't read and the skill loses its `description`; a comment inside it
 * is dropped by the parser and still the first thing a person opening the file sees.
 */
const skill: ManagedFile = {
  render(version) {
    const body = fs.readFileSync(path.join(packageDir, 'skills/nestjs-endpoints/SKILL.md'), 'utf8');
    if (!body.startsWith('---\n')) {
      throw new Error('skills/nestjs-endpoints/SKILL.md must open with YAML frontmatter on line 1');
    }
    return `---\n# nestjs-endpoints skill v${version} sha256:${hash(body)} ${TAIL}\n${body.slice(4)}`;
  },
  read(text) {
    const lines = text.split('\n');
    const match =
      lines[0] === '---'
        ? /^# nestjs-endpoints skill v(\S+) sha256:([0-9a-f]{64}) .*$/.exec(lines[1] ?? '')
        : null;
    const rest = [lines[0], ...lines.slice(2)].join('\n');
    return match ? { version: match[1]!, unedited: hash(rest) === match[2] } : null;
  },
};

export function renderRules(version: string): string {
  return rules.render(version);
}

export function renderSkill(version: string): string {
  return skill.render(version);
}

/** `true` when `a` is an older `x.y.z` version than `b`. */
export function isOlder(a: string, b: string): boolean {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na !== nb) {
      return na < nb;
    }
  }
  return false;
}

/**
 * What is at `file`: nothing, the package's file as an older version wrote it, the package's
 * file as this version writes it, or a file of someone's own (one with no banner, or edited).
 */
function stateOf(
  file: string,
  kind: ManagedFile,
  version: string,
): 'missing' | 'stale' | 'current' | 'own' {
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    return code === 'ENOENT' || code === 'ENOTDIR' ? 'missing' : 'own';
  }
  const banner = kind.read(text);
  if (!banner?.unedited) {
    return 'own';
  }
  return isOlder(banner.version, version) ? 'stale' : 'current';
}

/**
 * A skill under `.claude/skills/` that links into this installed package's `skills/` folder, as
 * `pnpm approve` makes one (`pnpm-nestjs-endpoints-nestjs-endpoints`, or `nestjs-endpoints`).
 */
function linkedSkill(root: string, installed: string): string | null {
  const dir = path.join(root, '.claude', 'skills');
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return null;
  }
  for (const name of entries) {
    const entry = path.join(dir, name);
    try {
      if (
        fs.lstatSync(entry).isSymbolicLink() &&
        fs.realpathSync(entry).startsWith(path.join(installed, 'skills') + path.sep)
      ) {
        return entry;
      }
    } catch {
      // a link that leads nowhere is no skill
    }
  }
  return null;
}

function write(file: string, content: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

/**
 * Writes each file that is missing, and rewrites each one an older version wrote and nobody
 * edited since. Where pnpm linked the skill, the package's own copy in `.claude/skills/` is
 * removed if nobody edited it, since two copies would list the skill twice. Returns the files
 * it changed.
 *
 * @param root The repository the files go in.
 * @param installed The installed package's directory, its real path.
 */
export function syncAgentFiles(opts: {
  root: string;
  installed: string;
  version: string;
}): string[] {
  const { root, version } = opts;
  const changed: string[] = [];

  const rulesFile = path.join(root, RULES_FILE);
  const rulesState = stateOf(rulesFile, rules, version);
  if (rulesState === 'missing' || rulesState === 'stale') {
    write(rulesFile, rules.render(version));
    changed.push(rulesFile);
  }

  const skillFile = path.join(root, SKILL_FILE);
  const skillTargets = OTHER_SKILL_ROOTS.filter((dir) => fs.existsSync(path.join(root, dir))).map(
    (dir) => path.join(root, dir, 'skills', 'nestjs-endpoints', 'SKILL.md'),
  );
  if (linkedSkill(root, opts.installed)) {
    const state = stateOf(skillFile, skill, version);
    if (state === 'stale' || state === 'current') {
      fs.rmSync(skillFile);
      const dir = path.dirname(skillFile);
      if (fs.readdirSync(dir).length === 0) {
        fs.rmdirSync(dir);
      }
      changed.push(skillFile);
    }
  } else {
    skillTargets.unshift(skillFile);
  }
  for (const file of skillTargets) {
    const state = stateOf(file, skill, version);
    if (state === 'missing' || state === 'stale') {
      write(file, skill.render(version));
      changed.push(file);
    }
  }
  return changed;
}
