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
        ref: 'User',
        schemaType: 'input' as const,
      },
      expected: {
        openApiSchema: {
          $ref: '#/components/schemas/User',
        },
        schemaComponents: {
          User: {
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
            .openapi({
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
      },
    },
    {
      params: {
        schema: z
          .object({ email: z.string().email() })
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
        ref: 'User',
      },
      expected: {
        openApiSchema: {
          $ref: '#/components/schemas/User',
        },
        schemaComponents: {
          User: {
            allOf: [
              {
                type: 'object',
                properties: {
                  email: {
                    type: 'string',
                    format: 'email',
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
                oneOf: [
                  {
                    type: 'object',
                    properties: {
                      type: {
                        type: 'string',
                        enum: ['admin'],
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
                        enum: ['user'],
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
              additionalProperties: {
                type: 'string',
              },
            },
          },
          required: ['dict'],
        },
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
            { type: 'string', enum: ['a'] },
            { type: 'string', enum: ['b'] },
          ],
        },
        schemaComponents: undefined,
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
        schemaComponents: undefined,
      },
    },
    {
      params: {
        schema: z
          .string()
          .transform((s) => s.toUpperCase())
          .openapi({
            effectType: 'same',
          }),
        schemaType: 'output' as const,
      },
      expected: {
        openApiSchema: {
          type: 'string',
        },
        schemaComponents: undefined,
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
