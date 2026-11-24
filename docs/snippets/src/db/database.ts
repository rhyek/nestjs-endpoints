import { PgDatabase, type PgQueryResultHKT } from 'drizzle-orm/pg-core';
import type * as schema from './schema.js';

/**
 * The app's Drizzle database, and its injection token: provided with the client `drizzle()`
 * returns, as `{ provide: Database, useFactory: () => drizzle(...) }`.
 */
export class Database extends PgDatabase<PgQueryResultHKT, typeof schema> {}
