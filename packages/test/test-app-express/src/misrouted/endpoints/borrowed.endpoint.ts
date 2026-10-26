import { endpoint } from '../../workspace/router.module';

export default endpoint.query({
  handler: ({ workspace }) => workspace.name(),
});
