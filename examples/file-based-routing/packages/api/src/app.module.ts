import { Module } from '@nestjs/common';
import { EndpointRouterModule } from 'nestjs-endpoints';

@Module({
  imports: [
    EndpointRouterModule.create({
      rootDirectory: './endpoints',
    }),
  ],
})
export class AppModule {}
