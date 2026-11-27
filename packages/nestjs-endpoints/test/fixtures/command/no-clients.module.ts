import { Module } from '@nestjs/common';
import { NestjsEndpoints } from '../../../src/nestjs-endpoints';

@Module({ imports: [NestjsEndpoints.forRoot()] })
export class AppModule {}
