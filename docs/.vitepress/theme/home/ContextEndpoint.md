```ts twoslash
// @filename: src/endpoints/projects/$projectId/view.sample.ts
import router from './router.js';
// ---cut---
export default router.endpoint.query({
  handler: ({ params, projects, user }) => {
    //        ^?
    return projects.find(params.projectId, user.id);
  },
});
```
