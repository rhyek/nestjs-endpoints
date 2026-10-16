import { Module } from '@nestjs/common';
import { EndpointRouterModule } from 'nestjs-endpoints';
// Registers the app's endpoint files for file-based routing. Generated and
// kept in sync by nestjs-endpoints; importing it loads no endpoints.
import './endpoints.gen.js';

@Module({
  imports: [
    EndpointRouterModule.create({
      rootDirectory: './endpoints',
    }),
  ],
})
export class AppModule {}
