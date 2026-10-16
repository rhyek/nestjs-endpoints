#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { readImportExtension } from './manifest/file.js';
import {
  DEFAULT_SOURCE_DIR,
  generateManifest,
  markGenerated,
} from './manifest/generate.js';
import { ImportExtension } from './manifest/render.js';
import {
  installSkill,
  isSkillInstalled,
  readOwnVersion,
  refreshSkillIfStale,
} from './skill.js';

const USAGE = `nestjs-endpoints <command>

Commands:
  init       Set up a project: write the endpoint manifest (src/endpoints.gen.ts)
             and install the agent skill into .claude/skills
               --dir <dir>                source directory (default: src)
               --import-extension js|ts   how the manifest spells import
                                          specifiers (default: js; ts for
                                          Node's native type stripping)
               --refresh   only rewrite an already-installed, unedited skill
                           (no-op otherwise); intended for postinstall/CI hooks
  generate   Rewrite the endpoint manifest from the files on disk
               --dir <dir>, --import-extension js|ts   as for init
  help       Show this message
`;

/** `--name value` or `--name=value`. */
function flag(argv: string[], name: string): string | undefined {
  const inline = argv.find((a) => a.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const i = argv.indexOf(name);
  return i === -1 ? undefined : argv[i + 1];
}

function manifestOptions(argv: string[]): {
  dir: string;
  importExtension?: ImportExtension;
} {
  const importExtension = flag(argv, '--import-extension');
  if (
    importExtension !== undefined &&
    importExtension !== 'js' &&
    importExtension !== 'ts'
  ) {
    throw new Error(
      `--import-extension must be js or ts, got: ${importExtension}`,
    );
  }
  return {
    dir: path.resolve(flag(argv, '--dir') ?? DEFAULT_SOURCE_DIR),
    importExtension,
  };
}

function runGenerate(argv: string[]): { file: string } {
  const { file, keys } = generateManifest(manifestOptions(argv));
  console.log(
    `Wrote ${path.relative(process.cwd(), file)} (${keys.length} file${keys.length === 1 ? '' : 's'})`,
  );
  return { file };
}

function runInit(argv: string[]): void {
  const cwd = process.cwd();
  const version = readOwnVersion();
  const refreshOnly = argv.includes('--refresh');

  if (refreshOnly) {
    const refreshed = refreshSkillIfStale({ cwd, version });
    if (refreshed) {
      console.log(`Updated agent skill (v${version})`);
    }
    return;
  }

  const options = manifestOptions(argv);
  if (fs.existsSync(options.dir)) {
    const { file } = runGenerate(argv);
    for (const changed of markGenerated(cwd, file)) {
      console.log(
        `Marked it as generated in ${path.relative(cwd, changed)}`,
      );
    }
    console.log(
      `\nImport it once from your app module (tests that skip the app module import it too, or list it in Vitest's setupFiles):\n  import './endpoints.gen.${readImportExtension(file)}';\n`,
    );
  } else {
    console.log(
      `No ${path.relative(cwd, options.dir) || '.'}/ directory, so no endpoint manifest was written. Run \`nestjs-endpoints generate --dir <dir>\` from your source directory's parent.\n`,
    );
  }

  const existed = isSkillInstalled(cwd);
  const paths = installSkill({ cwd, version });
  console.log(
    `${existed ? 'Updated' : 'Installed'} agent skill (v${version}):`,
  );
  for (const p of paths) {
    console.log(`  ${path.relative(cwd, p)}`);
  }
  if (!existed) {
    console.log(
      `\nThe skill points agents at node_modules/nestjs-endpoints/docs/agents.md.`,
    );
  }
}

function main(): void {
  const [command, ...rest] = process.argv.slice(2);
  switch (command) {
    case 'init':
      runInit(rest);
      break;
    case 'generate':
      runGenerate(rest);
      break;
    case 'help':
    case '--help':
    case '-h':
    case undefined:
      console.log(USAGE);
      break;
    case '--version':
    case '-v':
      console.log(readOwnVersion());
      break;
    default:
      console.error(`Unknown command: ${command}\n`);
      console.error(USAGE);
      process.exitCode = 1;
  }
}

try {
  main();
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
}
