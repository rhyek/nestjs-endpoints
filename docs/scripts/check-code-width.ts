// Fails when a line of a code sample on a page is wider than a code block shows without
// scrolling: 66 characters, measured at a 1280px window with the sidebar and the outline open.
// An import's line, and a comment that is only a file's path, are left as they are: a path
// cannot break.
//
//   node scripts/check-code-width.ts

import { globSync, readFileSync } from 'node:fs';
import path from 'node:path';

const MAX = 66;
const docs = path.join(import.meta.dirname, '..');
// The home page's samples sit in windows of their own width, and the rest is not pages.
const skipped = ['node_modules', '.vitepress', 'snippets', 'public', 'scripts'];

const pages = globSync('**/*.md', {
  cwd: docs,
  exclude: skipped.map((name) => `**/${name}`),
}).map((page) => path.join(docs, page));

/** The line as the page shows it: without Twoslash's markers and Shiki's annotations. */
function shown(line: string): string | null {
  const trimmed = line.trim();
  if (/^\/\/ *(\^[?|]|@\w+|---cut)/.test(trimmed)) {
    return null;
  }
  return line.replace(/\s*\/\/ \[!code [^\]]+\]$/, '');
}

const failures: string[] = [];
for (const file of pages) {
  const lines = readFileSync(file, 'utf8').split('\n');
  // The fence's indentation, its language line, and whether lines are still Twoslash's hidden
  // setup (everything before `// ---cut---`).
  let fence: { indent: number; hidden: boolean } | null = null;
  lines.forEach((line, i) => {
    const opening = /^(\s*)```/.exec(line);
    if (opening) {
      fence = fence
        ? null
        : {
            indent: opening[1]!.length,
            hidden:
              /\btwoslash\b/.test(line) && lines.slice(i).some((l) => l.includes('// ---cut---')),
          };
      return;
    }
    if (!fence) {
      return;
    }
    if (fence.hidden) {
      if (line.includes('// ---cut---')) {
        fence.hidden = false;
      }
      return;
    }
    const text = shown(line.slice(fence.indent));
    if (
      text === null ||
      /^\s*import\b.*\bfrom\s+['"][^'"]+['"];?$/.test(text) ||
      /^\s*\/\/ \S+$/.test(text)
    ) {
      return;
    }
    if (text.length > MAX) {
      failures.push(`${path.relative(docs, file)}:${i + 1}: ${text.length} characters`);
    }
  });
}

if (failures.length > 0) {
  console.error(
    `Code sample lines wider than ${MAX} characters, which scroll on a 1280px window:\n` +
      failures.map((f) => `  ${f}`).join('\n'),
  );
  process.exit(1);
}
