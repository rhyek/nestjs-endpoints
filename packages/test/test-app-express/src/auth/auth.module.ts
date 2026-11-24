import { Module } from '@nestjs/common';
import { EndpointRouter } from 'nestjs-endpoints';
import { AuthService } from './auth.service';

@Module({
  providers: [AuthService],
  exports: [AuthService],
  imports: [
    EndpointRouter.create({
      basePath: 'auth',
      providers: [AuthService],
    }),
  ],
})
export class AuthModule {}
