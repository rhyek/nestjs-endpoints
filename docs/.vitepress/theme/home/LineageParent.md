```ts twoslash
// @filename: src/endpoints/teams/router.sample.ts
import { EndpointRouter } from 'nestjs-endpoints';
import { DbModule } from '../../db/db.module.js';
import { DbService } from '../../db/db.service.js';
// ---cut---
export default EndpointRouter.create({
  imports: [DbModule],
  context: { inject: { db: DbService } },
});
```
