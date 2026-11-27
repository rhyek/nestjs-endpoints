import { Module } from '@nestjs/common';
import { NestjsEndpoints } from '../../../src/nestjs-endpoints';

@Module({ imports: [NestjsEndpoints.forRoot({ clients: [] })] })
class OtherModule {}

@Module({ imports: [OtherModule, NestjsEndpoints.forRoot({ clients: [] })] })
export class AppModule {}
