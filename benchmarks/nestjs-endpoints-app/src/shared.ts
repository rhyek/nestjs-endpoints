// Identical in both benchmark apps: `scripts/parity.ts` fails if the two copies differ. Schemas and
// handler bodies live here so the only thing that differs between the apps is how each wires them
// into Nest.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const role = z.enum(['admin', 'editor', 'viewer']);

const address = z.object({
  street: z.string().min(1),
  city: z.string().min(1),
  country: z.string().length(2),
  zip: z.string().regex(/^\d{5}$/),
});

const profile = z.object({
  bio: z.string().max(500),
  website: z.url(),
});

export const user = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  email: z.email(),
  age: z.number().int().min(0).nullable(),
  roles: z.array(role),
  address,
  createdAt: z.iso.datetime(),
  profile: profile.optional(),
});

export const userParams = z.object({
  userId: z.coerce.number().int().positive(),
});

export const userQuery = z.object({
  include: z.enum(['profile', 'none']).default('none'),
});

export const createUserInput = user.omit({ id: true, createdAt: true });

export const userList = z.object({
  items: z.array(user),
  total: z.number().int(),
});

// What handlers return carries a field no schema declares, as a database row would. Output
// validation must strip it: `scripts/parity.ts` fails if either app sends it.
export const undeclaredField = 'passwordHash';

type User = z.input<typeof user> & { [undeclaredField]: string };

const createdAt = '2026-01-15T10:30:00.000Z';

export function findUser(id: number, include: 'profile' | 'none'): User {
  return {
    id,
    name: `User ${id}`,
    email: `user${id}@example.com`,
    age: id % 7 === 0 ? null : 20 + (id % 50),
    roles: id % 3 === 0 ? ['admin', 'editor'] : ['viewer'],
    address: {
      street: `${id} Main Street`,
      city: 'Guatemala City',
      country: 'GT',
      zip: '01001',
    },
    createdAt,
    [undeclaredField]: '$2b$10$abcdefghijklmnopqrstuv',
    ...(include === 'profile'
      ? { profile: { bio: 'Writes software.', website: 'https://example.com' } }
      : {}),
  };
}

export function createUser(input: z.output<typeof createUserInput>): User {
  return { ...input, id: 1001, createdAt, [undeclaredField]: '$2b$10$abcdefghijklmnopqrstuv' };
}

const listItems = Array.from({ length: 50 }, (_, i) => findUser(i + 1, 'profile'));

export function listUsers(): { items: User[]; total: number } {
  return { items: listItems, total: listItems.length };
}

export const healthBody = { status: 'ok' };

/** The resolved version of each package the app runs on, for the results file. */
export function resolvedVersions(packages: string[]): Record<string, string> {
  const versions: Record<string, string> = {};
  for (const name of packages) {
    let dir = path.dirname(fileURLToPath(import.meta.resolve(name)));
    while (dir !== path.dirname(dir)) {
      const pkgFile = path.join(dir, 'package.json');
      if (fs.existsSync(pkgFile)) {
        const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8')) as {
          name?: string;
          version: string;
        };
        if (pkg.name === name) {
          versions[name] = pkg.version;
          break;
        }
      }
      dir = path.dirname(dir);
    }
  }
  return versions;
}
