// Prints a port of this repository's block as this checkout has it (see ../ports.ts), for a
// package.json script that passes one on its command line: `node scripts/port.ts 22510`.
import { port } from '../ports.ts';

const [arg] = process.argv.slice(2);
if (!arg || !/^\d+$/.test(arg)) {
  process.stderr.write('usage: node scripts/port.ts <port of the main checkout>\n');
  process.exit(2);
}
process.stdout.write(`${port(Number(arg))}\n`);
