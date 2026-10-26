import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  contentHash,
  installSkill,
  isSkillInstalled,
  refreshSkillIfStale,
  renderSkill,
  skillInstallPath,
} from './skill.js';

describe('skill rendering', () => {
  it('stamps the managed banner with the version', () => {
    expect(renderSkill('1.2.3')).toContain(
      'nestjs-endpoints skill v1.2.3',
    );
  });

  // The banner has to sit INSIDE the frontmatter. Above it, YAML frontmatter no
  // longer starts on line 1, so nothing parses it and `description` — the field
  // the whole skill's discoverability rests on — silently disappears.
  it('keeps the frontmatter opening on line 1 and the banner just below', () => {
    const lines = renderSkill('1.2.3').split('\n');
    expect(lines[0]).toBe('---');
    expect(lines[1]).toContain('nestjs-endpoints skill v1.2.3');
    expect(lines.slice(0, 8).join('\n')).toContain(
      'name: nestjs-endpoints',
    );
  });

  // Agent Skills caps `description` at 1024 characters; a longer one may be
  // cut short or rejected where `init` installs it.
  test('keeps the description within 1024 characters', () => {
    const description = renderSkill('1.2.3').match(
      /^description: (.*)$/m,
    )?.[1];
    expect(description).toBeDefined();
    expect(description!.length).toBeLessThanOrEqual(1024);
  });

  it('replaces an existing banner rather than stacking them', () => {
    const once = renderSkill('1.0.0');
    // Re-rendering from the shipped template must not accumulate banners.
    const twice = renderSkill('2.0.0');
    expect(twice.match(/managed by/g)).toHaveLength(1);
    expect(once).not.toEqual(twice);
  });

  it('points at the guide that actually ships with the package', () => {
    expect(renderSkill('1.0.0')).toContain(
      'node_modules/nestjs-endpoints/docs/agents.md',
    );
    expect(
      fs.existsSync(path.join(import.meta.dirname, '../docs/agents.md')),
    ).toBe(true);
  });
});

describe('skill install + refresh', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = fs.mkdtempSync(
      path.join(os.tmpdir(), 'nestjs-endpoints-skill-'),
    );
  });

  afterEach(() => {
    fs.rmSync(cwd, { recursive: true, force: true });
  });

  it('writes the canonical .claude path and records state', () => {
    installSkill({ cwd, version: '1.0.0' });

    const file = skillInstallPath(cwd);
    expect(fs.existsSync(file)).toBe(true);
    expect(isSkillInstalled(cwd)).toBe(true);

    const state = JSON.parse(
      fs.readFileSync(
        path.join(cwd, 'node_modules/.nestjs-endpoints/skill.json'),
        'utf8',
      ),
    );
    expect(state.version).toBe('1.0.0');
    expect(state.hash).toBe(contentHash(fs.readFileSync(file, 'utf8')));
  });

  it('mirrors into .agents / .cursor only when they already exist', () => {
    fs.mkdirSync(path.join(cwd, '.cursor'), { recursive: true });
    installSkill({ cwd, version: '1.0.0' });

    expect(
      fs.existsSync(
        path.join(cwd, '.cursor/skills/nestjs-endpoints/SKILL.md'),
      ),
    ).toBe(true);
    expect(fs.existsSync(path.join(cwd, '.agents'))).toBe(false);
  });

  it('refreshes an untouched skill on version bump', () => {
    installSkill({ cwd, version: '1.0.0' });
    expect(refreshSkillIfStale({ cwd, version: '1.1.0' })).toBe(true);
    expect(fs.readFileSync(skillInstallPath(cwd), 'utf8')).toContain(
      'skill v1.1.0',
    );
  });

  it('leaves a hand-edited skill alone', () => {
    installSkill({ cwd, version: '1.0.0' });
    const file = skillInstallPath(cwd);
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8') + '\nmine\n');

    expect(refreshSkillIfStale({ cwd, version: '1.1.0' })).toBe(false);
    expect(fs.readFileSync(file, 'utf8')).toContain('mine');
  });

  it('does nothing when the installed version is current or newer', () => {
    installSkill({ cwd, version: '2.0.0' });
    expect(refreshSkillIfStale({ cwd, version: '2.0.0' })).toBe(false);
    expect(refreshSkillIfStale({ cwd, version: '1.0.0' })).toBe(false);
  });

  it('does nothing when the skill was never installed', () => {
    expect(refreshSkillIfStale({ cwd, version: '9.9.9' })).toBe(false);
  });
});
