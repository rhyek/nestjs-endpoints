import z from 'zod';
import { zodToOpenApi } from './zod-to-openapi';

describe('zodToOpenApi', () => {
  test.each([
    {
      params: {
        schema: z.object({
          name: z.string(),
          birthDate: z.coerce.date().optional(),
          age: z.number().default(18),
        }),
        ref: 'User1',
        schemaType: 'input' as const,
      },
      expected: {
        openApiSchema: {
          $ref: '#/components/schemas/User1',
        },
        schemaComponents: {
          User1: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              birthDate: { type: 'string' },
              age: { type: 'number', default: 18 },
            },
            required: ['name'],
          },
        },
      },
    },
    {
      params: {
        schema: z.object({
          birthDate: z
            .date()
            .transform((date) => date.toISOString())
            .meta({
              type: 'string',
              format: 'date-time',
            }),
          age: z.number().default(18),
        }),
        ref: 'UserOutput',
        schemaType: 'output' as const,
      },
      expected: {
        openApiSchema: {
          $ref: '#/components/schemas/UserOutput',
        },
        schemaComponents: {
          UserOutput: {
            type: 'object',
            properties: {
              birthDate: { type: 'string', format: 'date-time' },
              age: { type: 'number', default: 18 },
            },
            required: ['birthDate', 'age'],
            additionalProperties: false,
          },
        },
      },
    },
    {
      params: {
        schema: z.object({
          name: z.string(),
        }),
        schemaType: 'input' as const,
      },
      expected: {
        openApiSchema: {
          type: 'object',
          properties: {
            name: { type: 'string' },
          },
          required: ['name'],
        },
        schemaComponents: {},
      },
    },
    {
      params: {
        schema: z.discriminatedUnion('type', [
          z.object({
            type: z.literal('admin'),
            admin: z.object({
              name: z.string(),
            }),
          }),
          z.object({
            type: z.literal('user'),
            user: z.object({
              name: z.string(),
            }),
          }),
        ]),
        schemaType: 'input' as const,
      },
      expected: {
        openApiSchema: {
          oneOf: [
            {
              properties: {
                admin: {
                  properties: {
                    name: {
                      type: 'string',
                    },
                  },
                  required: ['name'],
                  type: 'object',
                },
                type: {
                  const: 'admin',
                  type: 'string',
                },
              },
              required: ['type', 'admin'],
              type: 'object',
            },
            {
              properties: {
                type: {
                  const: 'user',
                  type: 'string',
                },
                user: {
                  properties: {
                    name: {
                      type: 'string',
                    },
                  },
                  required: ['name'],
                  type: 'object',
                },
              },
              required: ['type', 'user'],
              type: 'object',
            },
          ],
          type: 'object',
        },
        schemaComponents: {},
      },
    },
    {
      params: {
        schema: z
          .object({ email: z.email() })
          .and(
            z.object({
              age: z.number().min(18),
            }),
          )
          .and(
            z.discriminatedUnion('type', [
              z.object({
                type: z.literal('admin'),
                admin: z.object({
                  name: z.string(),
                }),
              }),
              z.object({
                type: z.literal('user'),
                user: z.object({
                  name: z.string(),
                }),
              }),
            ]),
          ),
        schemaType: 'input' as const,
        ref: 'User2',
      },
      expected: {
        openApiSchema: {
          $ref: '#/components/schemas/User2',
        },
        schemaComponents: {
          User2: {
            allOf: [
              {
                type: 'object',
                properties: {
                  email: {
                    format: 'email',

                    pattern:
                      "^(?!\\.)(?!.*\\.\\.)([A-Za-z0-9_'+\\-\\.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9\\-]*\\.)+[A-Za-z]{2,}$",
                    type: 'string',
                  },
                },
                required: ['email'],
              },
              {
                type: 'object',
                properties: {
                  age: {
                    type: 'number',
                    minimum: 18,
                  },
                },
                required: ['age'],
              },
              {
                type: 'object',
                oneOf: [
                  {
                    type: 'object',
                    properties: {
                      type: {
                        type: 'string',
                        const: 'admin',
                      },
                      admin: {
                        type: 'object',
                        properties: {
                          name: {
                            type: 'string',
                          },
                        },
                        required: ['name'],
                      },
                    },
                    required: ['type', 'admin'],
                  },
                  {
                    type: 'object',
                    properties: {
                      type: {
                        type: 'string',
                        const: 'user',
                      },
                      user: {
                        type: 'object',
                        properties: {
                          name: {
                            type: 'string',
                          },
                        },
                        required: ['name'],
                      },
                    },
                    required: ['type', 'user'],
                  },
                ],
              },
            ],
          },
        },
      },
    },
    {
      params: {
        schema: z.object({
          dict: z.record(z.string(), z.string()),
        }),
        schemaType: 'input' as const,
      },
      expected: {
        openApiSchema: {
          type: 'object',
          properties: {
            dict: {
              type: 'object',
              propertyNames: {
                type: 'string',
              },
              additionalProperties: {
                type: 'string',
              },
            },
          },
          required: ['dict'],
        },
        schemaComponents: {},
      },
    },
    {
      params: {
        schema: z.union([z.literal('a'), z.literal('b')]),
        schemaType: 'input' as const,
      },
      expected: {
        openApiSchema: {
          oneOf: [
            { type: 'string', const: 'a' },
            { type: 'string', const: 'b' },
          ],
        },
        schemaComponents: {},
      },
    },
    {
      params: {
        schema: z.string().transform((s) => s.toUpperCase()),
        schemaType: 'input' as const,
      },
      expected: {
        openApiSchema: {
          type: 'string',
        },
        schemaComponents: {},
      },
    },
    {
      params: {
        schema: z.string().overwrite((s) => s.toUpperCase()),
        schemaType: 'output' as const,
      },
      expected: {
        openApiSchema: {
          type: 'string',
        },
        schemaComponents: {},
      },
    },
    {
      params: {
        schema: z
          .string()
          .transform((s) => s.toUpperCase())
          .meta({
            type: 'string',
          }),
        schemaType: 'output' as const,
      },
      expected: {
        openApiSchema: {
          type: 'string',
        },
        schemaComponents: {},
      },
    },
    {
      params: {
        schema: z.object({
          person: z.preprocess(
            (data: any) => data,
            z
              .object({
                name: z.string(),
              })
              .nullish()
              .default(null),
          ),
        }),
        schemaType: 'input' as const,
      },
      expected: {
        openApiSchema: {
          properties: {
            person: {
              default: null,
              oneOf: [
                {
                  properties: {
                    name: {
                      type: 'string',
                    },
                  },
                  required: ['name'],
                  type: 'object',
                },
                {
                  type: 'null',
                },
              ],
            },
          },
          required: ['person'],
          type: 'object',
        },
        schemaComponents: {},
      },
    },
    {
      params: {
        schema: z.object({
          person: z
            .object({
              name: z.string(),
            })
            .nullish()
            .default(null),
        }),
        schemaType: 'input' as const,
      },
      expected: {
        openApiSchema: {
          properties: {
            person: {
              default: null,
              oneOf: [
                {
                  properties: {
                    name: {
                      type: 'string',
                    },
                  },
                  required: ['name'],
                  type: 'object',
                },
                {
                  type: 'null',
                },
              ],
            },
          },
          type: 'object',
        },
        schemaComponents: {},
      },
    },
  ])(
    'should return the correct openapi schema for %$',
    ({ params, expected }) => {
      const result = zodToOpenApi(params);
      expect(result).toEqual(expected);
    },
  );
});
