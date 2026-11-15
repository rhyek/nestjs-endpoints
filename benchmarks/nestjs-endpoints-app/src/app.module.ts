import { Module } from '@nestjs/common';
import { EndpointRouterModule } from 'nestjs-endpoints';
import './endpoints.gen';

@Module({
  imports: [EndpointRouterModule.create({ rootDirectory: './endpoints' })],
})
export class AppModule {}
