import {
  Body,
  Controller,
  Get,
  HttpCode,
  Injectable,
  Param,
  Post,
  Query,
  SerializeOptions,
  StandardSchemaSerializerInterceptor,
  StandardSchemaValidationPipe,
  UseInterceptors,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
  type PipeTransform,
} from '@nestjs/common';
import { z } from 'zod';
import {
  createUser,
  createUserInput,
  findUser,
  listUsers,
  user,
  userList,
  userParams,
  userQuery,
} from '../shared';

// `UsersController` (../app.controller.ts) with the work of its pipe, of its interceptor, or of
// both moved into the handlers: the same schemas, called with `parse()`. Each class is written
// out in full, so that each is the controller an app would have. A handler here answers an
// invalid request with a 500, so these are measured on valid requests only.

/** The schema pipe, without the walk that removes `__proto__`, `prototype` and `constructor`. */
export class SchemaPipeWithoutKeyRemoval extends StandardSchemaValidationPipe {
  protected override stripProtoKeys() {}
}

/** What NestJS spends on a pipe that does nothing. */
export class PassThroughPipe implements PipeTransform {
  transform(value: unknown) {
    return value;
  }
}

/** What NestJS spends on an interceptor that does nothing. */
@Injectable()
export class PassThroughInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler) {
    return next.handle();
  }
}

/** The handlers parse their input; the serializer validates their output. */
@Controller()
@UseInterceptors(StandardSchemaSerializerInterceptor)
export class InputInHandlerController {
  @Get('user/:userId')
  @SerializeOptions({ schema: user })
  findUser(@Param() params: unknown, @Query() query: unknown) {
    const { userId } = userParams.parse(params);
    const { include } = userQuery.parse(query);
    return findUser(userId, include);
  }

  @Post('users/create')
  @HttpCode(200)
  @SerializeOptions({ schema: user })
  createUser(@Body() input: unknown) {
    return createUser(createUserInput.parse(input));
  }

  @Get('users/list')
  @SerializeOptions({ schema: userList })
  listUsers() {
    return listUsers();
  }
}

/** The pipe validates the input; the handlers parse their output. No interceptor. */
@Controller()
export class OutputInHandlerController {
  @Get('user/:userId')
  findUser(
    @Param({ schema: userParams }) params: z.output<typeof userParams>,
    @Query({ schema: userQuery }) query: z.output<typeof userQuery>,
  ) {
    return user.parse(findUser(params.userId, query.include));
  }

  @Post('users/create')
  @HttpCode(200)
  createUser(@Body({ schema: createUserInput }) input: z.output<typeof createUserInput>) {
    return user.parse(createUser(input));
  }

  @Get('users/list')
  listUsers() {
    return userList.parse(listUsers());
  }
}

/** `OutputInHandlerController`, wrapped by an interceptor that does nothing. */
@Controller()
@UseInterceptors(PassThroughInterceptor)
export class OutputInHandlerInterceptedController {
  @Get('user/:userId')
  findUser(
    @Param({ schema: userParams }) params: z.output<typeof userParams>,
    @Query({ schema: userQuery }) query: z.output<typeof userQuery>,
  ) {
    return user.parse(findUser(params.userId, query.include));
  }

  @Post('users/create')
  @HttpCode(200)
  createUser(@Body({ schema: createUserInput }) input: z.output<typeof createUserInput>) {
    return user.parse(createUser(input));
  }

  @Get('users/list')
  listUsers() {
    return userList.parse(listUsers());
  }
}

/** No pipe and no interceptor: the handlers parse their input and their output. */
@Controller()
export class InHandlerController {
  @Get('user/:userId')
  findUser(@Param() params: unknown, @Query() query: unknown) {
    const { userId } = userParams.parse(params);
    const { include } = userQuery.parse(query);
    return user.parse(findUser(userId, include));
  }

  @Post('users/create')
  @HttpCode(200)
  createUser(@Body() input: unknown) {
    return user.parse(createUser(createUserInput.parse(input)));
  }

  @Get('users/list')
  listUsers() {
    return userList.parse(listUsers());
  }
}
