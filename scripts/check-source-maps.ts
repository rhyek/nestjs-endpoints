#!/usr/bin/env node
// Fails when a source map in packages/nestjs-endpoints/dist/ doesn't point at the package's own sources.
//
//   node scripts/check-source-maps.ts
//
// The build writes each map's sources relative to the map, so `dist/tui/layout.js.map` names
// `../../src/tui/layout.ts`. That holds only while the build writes into `dist/`, beside `src/`:
// compiled anywhere else, the relative path climbs out of the package and through the build
// machine's own directories, and the published maps carry them. The release runs this before it
// publishes, and CI after every build.
import fs from 'node:fs';
import path from 'node:path';

const pkg = path.join(import.meta.dirname, '../packages/nestjs-endpoints');
const dist = path.join(pkg, 'dist');
const src = path.join(pkg, 'src') + path.sep;

const maps = fs
  .readdirSync(dist, { recursive: true, encoding: 'utf8' })
  .filter((file) => file.endsWith('.map'));
if (maps.length === 0) {
  console.error(
    'check-source-maps: no source maps in packages/nestjs-endpoints/dist/. Build first.',
  );
  process.exit(1);
}

const bad: string[] = [];
for (const file of maps) {
  const map = JSON.parse(fs.readFileSync(path.join(dist, file), 'utf8')) as {
    sourceRoot?: string;
    sources: string[];
  };
  for (const source of map.sources) {
    const resolved = path.resolve(
      path.dirname(path.join(dist, file)),
      map.sourceRoot ?? '',
      source,
    );
    if (path.isAbsolute(source) || !resolved.startsWith(src) || !fs.existsSync(resolved)) {
      bad.push(`dist/${file}: ${source}`);
    }
  }
}
if (bad.length > 0) {
  console.error(
    `check-source-maps: ${bad.length} source(s) point outside packages/nestjs-endpoints/src/:\n  ` +
      bad.slice(0, 10).join('\n  ') +
      (bad.length > 10 ? `\n  … and ${bad.length - 10} more` : ''),
  );
  process.exit(1);
}
console.log(
  `check-source-maps: ${maps.length} maps, every source in packages/nestjs-endpoints/src/`,
);
