import { Module } from '@nestjs/common';
import { EndpointRouter } from '../../../src/endpoint-router';
import { NestjsEndpoints } from '../../../src/nestjs-endpoints';

// A library's router that expects a name the app's root does not give its endpoints.
const shared = EndpointRouter.create({
  rootDirectory: './endpoints',
  basePath: 'shared',
  expects: { db: EndpointRouter.given<object>() },
});

@Module({
  imports: [
    NestjsEndpoints.forRoot({
      router: { rootDirectory: './endpoints', routers: [shared] },
      clients: [],
    }),
  ],
})
export class AppModule {}
