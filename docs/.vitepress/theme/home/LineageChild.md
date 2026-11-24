```ts twoslash
// @filename: src/endpoints/teams/router.ts
import { EndpointRouter } from 'nestjs-endpoints';
import { DbModule } from '../../db/db.module.js';
import { DbService } from '../../db/db.service.js';

export default EndpointRouter.create({
  imports: [DbModule],
  context: { inject: { db: DbService } },
});
// @filename: src/endpoints/teams/$teamId/router.sample.ts
import { z } from 'nestjs-endpoints';
// ---cut---
import teamsRouter from '../router.js';

export default teamsRouter.child({
  context: { params: z.object({ teamId: z.uuid() }) },
});
```
