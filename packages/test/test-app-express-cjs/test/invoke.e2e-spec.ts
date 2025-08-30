import { Test, TestingModule } from '@nestjs/testing';
import { ZodValidationException } from 'nestjs-endpoints';
import { AuthService } from '../src/auth/auth.service';
import userCreateEndpoint from '../src/endpoints/user/create.endpoint';
import userFindEndpoint from '../src/endpoints/user/find.endpoint';
import { userListNoPath as userListNoPathEndpoint } from '../src/endpoints/user/list/user-list-no-path.endpoint';
import userPurgeEndpoint from '../src/endpoints/user/purge.endpoint';
import { UserRepository } from '../src/endpoints/user/user.repository';
import { UserRepositoryToken } from '../src/endpoints/user/user.repository.token';
import { UserService } from '../src/endpoints/user/user.service';

test('can test controllers directly without http pipeline', async () => {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    controllers: [
      userListNoPathEndpoint,
      userCreateEndpoint,
      userPurgeEndpoint,
      userFindEndpoint,
    ],
    providers: [
      AuthService,
      {
        provide: UserRepositoryToken,
        useClass: UserRepository,
      },
      UserService,
    ],
  }).compile();
  const app = moduleFixture.createNestApplication();
  app.useLogger(false);
  await app.init();
  const userRepository = app.get<UserRepository>(UserRepositoryToken);
  const userListNoPath = app.get(userListNoPathEndpoint);
  const userCreate = app.get(userCreateEndpoint);
  const userPurge = app.get(userPurgeEndpoint);
  const userFind = app.get(userFindEndpoint);
  expect(userRepository.findAll()).toEqual([]);
  await expect(userListNoPath.invoke()).resolves.toEqual([]);
  try {
    await userCreate.invoke({
      email: 'john@example.com',
    } as any);
    throw new Error('Should not reach here');
  } catch (error) {
    expect(error).toBeInstanceOf(ZodValidationException);
    const zodError = (error as ZodValidationException).getZodError();
    expect(zodError).toMatchObject({
      issues: [
        {
          expected: 'string',
          code: 'invalid_type',
          path: ['name'],
          message: 'Invalid input: expected string, received undefined',
        },
      ],
    });
  }
  await expect(
    userCreate.invoke({
      name: 'John',
      email: 'john@example.com',
    }),
  ).resolves.toEqual({ id: 1 });
  expect(userRepository.findAll()).toEqual([
    { id: 1, name: 'John', email: 'john@example.com' },
  ]);
  await expect(userListNoPath.invoke()).resolves.toEqual([
    { id: 1, name: 'John', email: 'john@example.com' },
  ]);
  await expect(userFind.invoke({ id: 1 })).resolves.toEqual({
    id: 1,
    name: 'John',
    email: 'john@example.com',
  });
  await expect(userPurge.invoke()).resolves.toEqual(undefined);
  await expect(userListNoPath.invoke()).resolves.toEqual([]);
});
