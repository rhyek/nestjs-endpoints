import { Module } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/node-postgres';
import { DbService } from './db.service.js';
import * as schema from './schema.js';

/** Provides the Drizzle database as `DbService`, to the routers that import it. */
@Module({
  providers: [
    {
      provide: DbService,
      useFactory: () => drizzle(process.env.DATABASE_URL!, { schema }),
    },
  ],
  exports: [DbService],
})
export class DbModule {}
