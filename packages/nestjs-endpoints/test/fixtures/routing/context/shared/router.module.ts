import { EndpointRouter } from '../../../../../src/endpoint-router';
import { Access } from '../access';
import { ClockModule } from '../clock';

export default EndpointRouter.create({
  imports: [ClockModule],
  providers: [Access],
  context: {
    inject: { access: Access },
  },
});
