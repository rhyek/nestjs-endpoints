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
// @filename: src/endpoints/teams/$teamId/members/find.sample.ts
import { and, eq } from 'drizzle-orm';
import { z } from 'nestjs-endpoints';
import { members } from '../../../../db/schema.js';
// ---cut---
import membersRouter from '../router.js';

export default membersRouter.endpoint.query({
  input: z.object({ email: z.email() }),
  handler: ({ params, input, db }) =>
    //        ^?
    db.query.members.findFirst({
      where: and(
        eq(members.teamId, params.teamId),
        eq(members.email, input.email),
      ),
    }),
});
```
