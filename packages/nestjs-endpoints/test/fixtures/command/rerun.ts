// The command's script, as a test of its run again under `--import` gives it: it writes down how
// Node ran it, then ends as the module file it was given says, with an exit code or a signal.
import fs from 'node:fs';
import path from 'node:path';

const [, , ...args] = process.argv;
const how = args.at(-1) ?? '';
fs.writeFileSync(
  path.join(process.env.COMMAND_FIXTURE_OUT!, 'rerun.json'),
  JSON.stringify({ execArgv: process.execArgv, args }),
);
if (how.startsWith('SIG')) {
  process.kill(process.pid, how);
} else {
  process.exitCode = Number(how);
}
