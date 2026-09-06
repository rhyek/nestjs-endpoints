import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/**
 * The managed banner. It lives INSIDE the frontmatter, as a YAML comment on the
 * line after the opening `---`, so it is the first thing a human opening the
 * file sees while still being dropped by the YAML parser. Putting it *above*
 * the frontmatter would break the file outright: YAML frontmatter has to begin
 * on line 1, so anything in front of it means the block is never parsed as
 * frontmatter and the `description` — the one field that decides whether a
 * skill is ever invoked — is lost.
 */
const BANNER_RE =
  /^# nestjs-endpoints skill v.*? — managed by `nestjs-endpoints init`; do not edit\n/;

function banner(version: string): string {
  return `# nestjs-endpoints skill v${version} — managed by \`nestjs-endpoints init\`; do not edit\n`;
}

/** Reads the shipped `assets/skill.md` template and stamps the managed banner. */
export function renderSkill(version: string): string {
  const templatePath = path.join(
    import.meta.dirname,
    '../assets/skill.md',
  );
  const template = fs
    .readFileSync(templatePath, 'utf8')
    .replace(BANNER_RE, '');

  if (!template.startsWith('---\n')) {
    throw new Error(
      'assets/skill.md must open with YAML frontmatter on line 1',
    );
  }
  return `---\n` + banner(version) + template.slice('---\n'.length);
}

export function contentHash(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex');
}

/** Reads this package's own version (for the skill banner). Falls back to '0.0.0'. */
export function readOwnVersion(): string {
  try {
    const pkgPath = path.join(import.meta.dirname, '../package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as {
      version?: string;
    };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/** `true` when `a` is an older semver-ish (`x.y.z`) version than `b`. */
function isOlder(a: string, b: string): boolean {
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

interface SkillState {
  /** Every path the skill was installed to (`.claude/`, plus `.agents/`/`.cursor/` when present). */
  paths: string[];
  version: string;
  hash: string;
}

function stateFile(cwd: string): string {
  const dir = path.join(cwd, 'node_modules', '.nestjs-endpoints');
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'skill.json');
}

function readState(cwd: string): SkillState | null {
  try {
    return JSON.parse(
      fs.readFileSync(stateFile(cwd), 'utf8'),
    ) as SkillState;
  } catch {
    return null;
  }
}

function writeSkillFile(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

/**
 * Best-effort secondary install targets: mirrored under any of these that
 * already exist, alongside the canonical `.claude/` install.
 */
const OPTIONAL_DIRS = ['.agents', '.cursor'];

/** Canonical install path (`.claude/skills/nestjs-endpoints/SKILL.md`). */
export function skillInstallPath(cwd: string): string {
  return path.join(
    cwd,
    '.claude',
    'skills',
    'nestjs-endpoints',
    'SKILL.md',
  );
}

/** `true` when the managed skill file is already installed at `cwd`. */
export function isSkillInstalled(cwd: string): boolean {
  return fs.existsSync(skillInstallPath(cwd));
}

/**
 * Writes the rendered skill to `.claude/skills/nestjs-endpoints/SKILL.md`
 * (always) and, when present, `.agents/` / `.cursor/` (best-effort). Records
 * the installed paths + version + content hash in
 * `node_modules/.nestjs-endpoints/skill.json` so a later `init` can tell an
 * untouched file from a hand-edited one.
 */
export function installSkill(opts: {
  cwd?: string;
  version: string;
}): string[] {
  const cwd = opts.cwd ?? process.cwd();
  const content = renderSkill(opts.version);
  const paths: string[] = [];

  const claudePath = skillInstallPath(cwd);
  writeSkillFile(claudePath, content);
  paths.push(claudePath);

  for (const dir of OPTIONAL_DIRS) {
    if (!fs.existsSync(path.join(cwd, dir))) {
      continue;
    }
    try {
      const p = path.join(
        cwd,
        dir,
        'skills',
        'nestjs-endpoints',
        'SKILL.md',
      );
      writeSkillFile(p, content);
      paths.push(p);
    } catch {
      // best-effort: a secondary target failing shouldn't fail setup.
    }
  }

  const state: SkillState = {
    paths,
    version: opts.version,
    hash: contentHash(content),
  };
  fs.writeFileSync(stateFile(cwd), JSON.stringify(state, null, 2));
  return paths;
}

/**
 * Rewrites a previously-installed skill when this package has been upgraded
 * since — but only if the on-disk file still hashes to what was last written.
 * A hand-edited file is left alone.
 */
export function refreshSkillIfStale(opts: {
  cwd?: string;
  version: string;
}): boolean {
  const cwd = opts.cwd ?? process.cwd();
  const state = readState(cwd);
  if (!state || !isOlder(state.version, opts.version)) {
    return false;
  }

  const canonical = state.paths[0];
  if (!canonical || !fs.existsSync(canonical)) {
    return false;
  }

  const onDisk = fs.readFileSync(canonical, 'utf8');
  if (contentHash(onDisk) !== state.hash) {
    return false; // hand-edited; leave untouched
  }

  installSkill(opts);
  return true;
}
