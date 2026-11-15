import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  SerializeOptions,
  StandardSchemaSerializerInterceptor,
  UseInterceptors,
} from '@nestjs/common';
import { z } from 'zod';
import {
  createUser,
  createUserInput,
  findUser,
  healthBody,
  listUsers,
  user,
  userList,
  userParams,
  userQuery,
} from './shared';

// No schemas, the framework's own cost: kept apart from the serializer below, which would otherwise
// wrap this handler too.
@Controller()
export class HealthController {
  @Get('health')
  health() {
    return healthBody;
  }
}

// The serializer bound to the controller, as in the Nest docs' main example.
@Controller()
@UseInterceptors(StandardSchemaSerializerInterceptor)
export class UsersController {
  @Get('user/:userId')
  @SerializeOptions({ schema: user })
  findUser(
    @Param({ schema: userParams }) params: z.output<typeof userParams>,
    @Query({ schema: userQuery }) query: z.output<typeof userQuery>,
  ) {
    return findUser(params.userId, query.include);
  }

  // nestjs-endpoints answers a mutation with 200; Nest's default for a POST is 201.
  @Post('users/create')
  @HttpCode(200)
  @SerializeOptions({ schema: user })
  createUser(@Body({ schema: createUserInput }) input: z.output<typeof createUserInput>) {
    return createUser(input);
  }

  // An object, not a bare array: the serializer applies its schema to each element of an array,
  // so this keeps both apps validating the same whole body.
  @Get('users/list')
  @SerializeOptions({ schema: userList })
  listUsers() {
    return listUsers();
  }
}
