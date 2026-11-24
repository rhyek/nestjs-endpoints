```ts twoslash
// @filename: src/endpoints/teams/router.ts
import { EndpointRouter } from 'nestjs-endpoints';
import { DbModule } from '../../db/db.module.js';
import { DbService } from '../../db/db.service.js';

export default EndpointRouter.create({
  imports: [DbModule],
  context: { inject: { db: DbService } },
});
// @filename: src/endpoints/teams/$teamId/router.ts
import { z } from 'nestjs-endpoints';
import teamsRouter from '../router.js';

export default teamsRouter.child({
  context: { params: z.object({ teamId: z.uuid() }) },
});
// @filename: src/endpoints/teams/$teamId/members/find.endpoint.ts
import { and, eq } from 'drizzle-orm';
import { z } from 'nestjs-endpoints';
import { members } from '../../../../db/schema.js';
import membersRouter from '../router.js';

export default membersRouter.endpoint.query({
  input: z.object({ email: z.email() }),
  handler: ({ params, input, db }) =>
    db.query.members.findFirst({
      where: and(
        eq(members.teamId, params.teamId),
        eq(members.email, input.email),
      ),
    }),
});
// @filename: src/endpoints/teams/$teamId/members/find.sample.ts
declare function test(name: string, run: () => Promise<void>): void;
declare function expect(value: unknown): { toMatchObject(expected: object): void };
// ---cut---
import { Test } from '@nestjs/testing';
import membersRouter from '../router.js';
import findEndpoint from './find.endpoint.js';

test('finds a member by email', async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [membersRouter],
  }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();

  const member = await app.get(findEndpoint).invoke({
    params: { teamId: '0b9e2c4a-6f1d-4e8b-9a3c-5d7f1e2b8c60' },
    input: { email: 'ada@example.com' },
  });

  expect(member).toMatchObject({ email: 'ada@example.com' });
});
```
