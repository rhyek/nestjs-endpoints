import { Controller, Get, Post } from '@nestjs/common';

@Controller('vanilla')
export class VanillaController {
  @Get('null')
  getNull() {
    return null;
  }

  @Post('null')
  postNull() {
    return null;
  }
}
