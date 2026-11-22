#!/usr/bin/env node
// Puts the docs an agent reads into the npm package: the site's `llms.txt` index and the Markdown
// copy of every page, as `vitepress build` wrote them (docs/.vitepress/dist), under
// packages/nestjs-endpoints/docs/. The agent rules file and skill the package installs point at
// `node_modules/nestjs-endpoints/docs/llms.txt`, so the docs an agent reads are the installed
// version's.
//
//   pnpm build      # builds the library and the site, then runs this
//
// The index links to pages from the site's root (`/guide/endpoints.md`); here they are made
// relative (`guide/endpoints.md`), so they resolve beside the index. Every link, the index's and
// the pages' own, is then checked against the files copied.
import fs from 'node:fs';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..');
const dist = path.join(root, 'docs/.vitepress/dist');
const out = path.join(root, 'packages/nestjs-endpoints/docs');

const index = path.join(dist, 'llms.txt');
if (!fs.existsSync(index)) {
  console.error(`package-docs: ${index} is missing. Build the site first.`);
  process.exit(1);
}

const pages = fs
  .readdirSync(dist, { recursive: true, encoding: 'utf8' })
  .filter((file) => file.endsWith('.md'))
  .toSorted();

fs.rmSync(out, { recursive: true, force: true });
for (const page of pages) {
  fs.mkdirSync(path.dirname(path.join(out, page)), { recursive: true });
  fs.copyFileSync(path.join(dist, page), path.join(out, page));
}
fs.writeFileSync(
  path.join(out, 'llms.txt'),
  fs.readFileSync(index, 'utf8').replaceAll(/\]\(\/(?!\/)/g, ']('),
);

// A link that leads nowhere would send an agent to a file that isn't there.
const broken: string[] = [];
for (const file of ['llms.txt', ...pages]) {
  const text = fs.readFileSync(path.join(out, file), 'utf8');
  for (const [, href] of text.matchAll(/\]\(([^)\s]+)\)/g)) {
    if (href === undefined || /^([a-z][a-z0-9+.-]*:|#)/i.test(href)) {
      continue;
    }
    const target = path.join(out, path.dirname(file), href.replace(/#.*$/, ''));
    if (!fs.existsSync(target)) {
      broken.push(`${file}: ${href}`);
    }
  }
}
if (broken.length > 0) {
  console.error(`package-docs: ${broken.length} link(s) lead nowhere:\n  ${broken.join('\n  ')}`);
  process.exit(1);
}

console.log(
  `package-docs: llms.txt and ${pages.length} pages written to packages/nestjs-endpoints/docs/`,
);
