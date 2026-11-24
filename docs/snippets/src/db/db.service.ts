import { PgDatabase, type PgQueryResultHKT } from 'drizzle-orm/pg-core';
import type * as schema from './schema.js';

/** The app's Drizzle database, by the class `DbModule` provides it under. */
export class DbService extends PgDatabase<PgQueryResultHKT, typeof schema> {}
