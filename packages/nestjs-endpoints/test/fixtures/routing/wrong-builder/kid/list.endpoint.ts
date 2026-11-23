// The mistake this fixture is for: the router of the folder above, not this folder's.
import router from '../router';

export default router.endpoint.query({ handler: () => null });
