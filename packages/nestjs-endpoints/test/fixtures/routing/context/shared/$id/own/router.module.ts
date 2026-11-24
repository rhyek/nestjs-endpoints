import { Access } from '../../../access';
import { Clock, ClockModule } from '../../../clock';
import item from '../router.module';

// Lists a provider its parent's parent has: this router has an instance of its own. The
// module it imports again is the one its parent's parent imports.
export default item.child({
  imports: [ClockModule],
  providers: [Access],
  context: {
    inject: { clock: Clock },
  },
});
