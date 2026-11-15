import { Module } from '@nestjs/common';
import { HealthController, UsersController } from './app.controller';

@Module({
  controllers: [HealthController, UsersController],
})
export class AppModule {}
