```ts twoslash
// @filename: src/endpoints/projects/$projectId/router.sample.ts
import { z } from 'nestjs-endpoints';
import projects from '../router.js';
// ---cut---
// Inherits the `projects` service and the current `user`
// from the router of the folder above.
export default projects.child({
  context: { params: z.object({ projectId: z.uuid() }) },
});
```
