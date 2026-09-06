#!/usr/bin/env node
import path from 'node:path';
import {
  installSkill,
  isSkillInstalled,
  readOwnVersion,
  refreshSkillIfStale,
} from './skill.js';

const USAGE = `nestjs-endpoints <command>

Commands:
  init     Install the agent skill into this project's .claude/skills
             --refresh   only rewrite an already-installed, unedited skill
                         (no-op otherwise); intended for postinstall/CI hooks
  help     Show this message
`;

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

main();
