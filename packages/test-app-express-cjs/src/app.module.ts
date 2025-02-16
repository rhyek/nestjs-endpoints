import { Module } from '@nestjs/common';
import { TestModule } from './test/test.module';
import { UserModule } from './user/user.module';

@Module({
  imports: [UserModule, TestModule],
})
export class AppModule {}
