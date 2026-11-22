// Reads the release state out of CHANGELOG.md. The top `## X.Y.Z` heading is the version
// to release; the workflows call this so they all parse it the same way.
//
//   node scripts/changelog.ts version   key=value lines for $GITHUB_OUTPUT: version, tag,
//                                       dist_tag, prerelease
//   node scripts/changelog.ts notes     the top section's body, as GitHub release notes, with
//                                       relative links pinned to the version's tag
//   node scripts/changelog.ts check     fails a PR whose top section can't be released:
//                                       empty, given a new entry after its release, or
//                                       not newer than the latest released version; and
//                                       one whose CHANGELOG.md links to a file or heading
//                                       that doesn't exist

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';

const HEADING = /^## (\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\s*$/;
const REPO = process.env.GITHUB_REPOSITORY ?? 'rhyek/nestjs-endpoints';

interface Section {
  version: string;
  body: string;
}

function topSection(changelog: string): Section {
  const lines = changelog.split('\n');
  const start = lines.findIndex((line) => line.startsWith('## '));
  const match = start === -1 ? null : HEADING.exec(lines[start]);
  if (!match) {
    fail(
      start === -1
        ? 'CHANGELOG.md has no "## X.Y.Z" heading.'
        : `CHANGELOG.md's top heading "${lines[start]}" is not "## X.Y.Z" or "## X.Y.Z-pre".`,
    );
  }
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith('## '));
  const body = (end === -1 ? rest : rest.slice(0, end)).join('\n').trim();
  return { version: match[1], body };
}

const tagFor = (version: string): string => `v${version}`;

const entries = (section: Section): number =>
  section.body.split('\n').filter((line) => line.startsWith('- ')).length;

// The prerelease's label names its npm dist-tag (`1.0.0-beta.1` → `beta`), so
// `npm install nestjs-endpoints` keeps resolving to the latest stable version.
function distTag(version: string): string {
  const pre = prerelease(version);
  if (pre === undefined) {
    return 'latest';
  }
  return /^[A-Za-z]+/.exec(pre)?.[0] ?? 'next';
}

function prerelease(version: string): string | undefined {
  const dash = version.indexOf('-');
  return dash === -1 ? undefined : version.slice(dash + 1);
}

// Semver precedence (semver.org §11), without build metadata, which the heading doesn't allow.
function compare(a: string, b: string): number {
  const [coreA, coreB] = [a, b].map((v) => v.split('-')[0].split('.').map(Number));
  for (let i = 0; i < 3; i++) {
    if (coreA[i] !== coreB[i]) {
      return coreA[i] - coreB[i];
    }
  }
  const [preA, preB] = [prerelease(a), prerelease(b)];
  if (preA === undefined || preB === undefined) {
    return preA === preB ? 0 : preA === undefined ? 1 : -1;
  }
  const [idsA, idsB] = [preA.split('.'), preB.split('.')];
  for (let i = 0; i < Math.max(idsA.length, idsB.length); i++) {
    if (idsA[i] === undefined) {
      return -1;
    }
    if (idsB[i] === undefined) {
      return 1;
    }
    if (idsA[i] === idsB[i]) {
      continue;
    }
    const [numA, numB] = [/^\d+$/.test(idsA[i]), /^\d+$/.test(idsB[i])];
    if (numA && numB) {
      return Number(idsA[i]) - Number(idsB[i]);
    }
    if (numA !== numB) {
      return numA ? -1 : 1;
    }
    return idsA[i] < idsB[i] ? -1 : 1;
  }
  return 0;
}

// A relative link: not a URL (`https:`, `mailto:`), an in-page `#anchor` or a root-relative path.
const RELATIVE_LINK = /\]\((?![a-z][a-z0-9+.-]*:|#|\/)([^)\s]+)\)/gi;

// GitHub's id for a heading: its text lowercased, punctuation dropped, each space a hyphen.
function slug(heading: string): string {
  return heading
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '')
    .replace(/ /g, '-');
}

function headingIds(markdown: string): Set<string> {
  const ids = new Set<string>();
  let fenced = false;
  for (const line of markdown.split('\n')) {
    if (line.startsWith('```')) {
      fenced = !fenced;
      continue;
    }
    const heading = fenced ? null : /^#{1,6} (.+)$/.exec(line);
    if (heading) {
      ids.add(slug(heading[1]));
    }
  }
  return ids;
}

// The changelog's relative links point at files in the repo, so they break when a page moves or
// a heading is renamed, in released sections as much as the new one. The release notes pin them
// to their tag (`pinLinks`), where they keep working; this keeps them working on `main`.
function brokenLinks(changelog: string): string[] {
  const broken: string[] = [];
  for (const [, target] of changelog.matchAll(RELATIVE_LINK)) {
    const [file, anchor] = target.split('#') as [string, string | undefined];
    if (!existsSync(file)) {
      broken.push(`${target}: there is no ${file}`);
    } else if (anchor && file.endsWith('.md') && statSync(file).isFile()) {
      if (!headingIds(readFileSync(file, 'utf8')).has(anchor.toLowerCase())) {
        broken.push(`${target}: ${file} has no heading #${anchor}`);
      }
    }
  }
  return broken;
}

// A relative link (`[docs](docs/guide/testing.md)`) would resolve against the releases page, so pin it
// to the file as it was at the release's tag, which never moves.
function pinLinks(body: string, tag: string): string {
  return body.replace(
    RELATIVE_LINK,
    (_, target: string) => `](https://github.com/${REPO}/blob/${tag}/${target})`,
  );
}

function git(...args: string[]): string {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function tagExists(tag: string): boolean {
  try {
    git('rev-parse', '--verify', '--quiet', `refs/tags/${tag}`);
    return true;
  } catch {
    return false;
  }
}

function check(section: Section, changelog: string): void {
  const broken = brokenLinks(changelog);
  if (broken.length > 0) {
    fail(`CHANGELOG.md links to what isn't there:\n  ${broken.join('\n  ')}`);
  }
  if (section.body === '') {
    fail(`CHANGELOG.md's ${section.version} section is empty.`);
  }

  const tag = tagFor(section.version);
  if (tagExists(tag)) {
    const released = topSection(git('show', `${tag}:CHANGELOG.md`));
    // Rewording a released entry or fixing its link is fine; a new entry would never be
    // released, since the version is already out.
    if (released.version === section.version && entries(section) > entries(released)) {
      fail(
        `${section.version} is already released, but its CHANGELOG.md section gained an ` +
          'entry. Put new entries under a new "## X.Y.Z" heading above it.',
      );
    }
    console.log(`CHANGELOG.md: ${section.version} is released; nothing new to release.`);
    return;
  }

  const released = git('tag', '--list', 'v*')
    .split('\n')
    .map((t) => t.slice(1))
    .filter((v) => HEADING.test(`## ${v}`));
  const latest = released.sort(compare).at(-1);
  if (latest !== undefined && compare(section.version, latest) <= 0) {
    fail(`CHANGELOG.md's ${section.version} is not newer than the latest release, ${latest}.`);
  }
  console.log(
    `CHANGELOG.md: merging this releases ${section.version} (npm: ${distTag(section.version)}).`,
  );
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const changelog = readFileSync('CHANGELOG.md', 'utf8');
const section = topSection(changelog);
const command = process.argv[2];

if (command === 'version') {
  console.log(`version=${section.version}`);
  console.log(`tag=${tagFor(section.version)}`);
  console.log(`dist_tag=${distTag(section.version)}`);
  console.log(`prerelease=${prerelease(section.version) !== undefined}`);
} else if (command === 'notes') {
  console.log(pinLinks(section.body, tagFor(section.version)));
} else if (command === 'check') {
  check(section, changelog);
} else {
  fail('Usage: node scripts/changelog.ts version|notes|check');
}
