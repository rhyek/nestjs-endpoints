import { EndpointRouter } from 'nestjs-endpoints';

// Not part of the app: its endpoint is built with another router's
// `endpoint`, which fails when this router sets it up.
export default EndpointRouter.create({
  rootDirectory: 'endpoints',
});
