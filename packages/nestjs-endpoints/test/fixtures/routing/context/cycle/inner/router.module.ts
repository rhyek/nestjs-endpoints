import { EndpointRouter } from '../../../../../../src/endpoint-router';
import outer from '../router.module';

// A nested router that imports the router it is nested under, and has a child of its own.
export default EndpointRouter.create({
  imports: [outer],
  providers: [{ provide: 'inner', useValue: true }],
});
