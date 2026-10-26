import { Module } from '@nestjs/common';
import { EndpointsRouterModule } from 'nestjs-endpoints';
import { AuthService } from './auth.service';

@Module({
  providers: [AuthService],
  exports: [AuthService],
  imports: [
    EndpointsRouterModule.register({
      basePath: 'auth',
      providers: [AuthService],
    }),
  ],
})
export class AuthModule {}
