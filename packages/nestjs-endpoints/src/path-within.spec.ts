import path from 'node:path';
import { isWithin } from './path-within';

const root = path.resolve('/repo');

test.each([
  ['the folder itself', root, true],
  ['a file in it', path.join(root, 'a.ts'), true],
  ['a file deep in it', path.join(root, 'a', 'b', 'c.ts'), true],
  ['a file in a folder named like `..cache`', path.join(root, '..cache', 'a.ts'), true],
  ['its parent', path.dirname(root), false],
  ['a folder beside it', path.resolve('/other'), false],
  ['a folder whose name begins alike', path.resolve('/repository'), false],
])('%s is within it: %s', (_, file, expected) => {
  expect(isWithin(file, root)).toBe(expected);
});
