#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { runCommand } from './codegen/command';

process.exitCode = await runCommand(process.argv.slice(2), {
  cwd: process.cwd(),
  bin: fileURLToPath(import.meta.url),
  out: (line) => console.log(line),
  err: (line) => console.error(line),
});

// The app's modules were imported, and may hold the process open: the command is done once
// what it printed is written. A pipe takes that in its own time, and an exit drops what it has
// not taken yet (https://nodejs.org/api/process.html#a-note-on-process-io).
await Promise.all(
  [process.stdout, process.stderr].map(
    (stream) =>
      new Promise((resolve) => {
        // A reader that went away ends the wait as well.
        stream.once('error', resolve);
        stream.write('', resolve);
      }),
  ),
);
process.exit();
