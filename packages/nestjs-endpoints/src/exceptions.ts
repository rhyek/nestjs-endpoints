import {
  BadRequestException,
  HttpStatus,
  InternalServerErrorException,
} from '@nestjs/common';
import { ZodError } from 'zod';

export class ZodValidationException extends BadRequestException {
  constructor(private error: ZodError) {
    super({
      statusCode: HttpStatus.BAD_REQUEST,
      message: 'Validation failed',
      errors: error.errors,
    });
  }

  public getZodError() {
    return this.error;
  }
}

export class ZodSerializationException extends InternalServerErrorException {
  constructor(private error: ZodError) {
    super();
  }

  public getZodError() {
    return this.error;
  }
}
