import { endpoint, z } from 'nestjs-endpoints';
import { CategoryService } from '../category.service';

export default endpoint.query({
  output: z.array(z.object({ id: z.number(), name: z.string() })),
  inject: { categories: CategoryService },
  handler: ({ categories }) => categories.list(),
});
