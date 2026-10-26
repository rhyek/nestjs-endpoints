import z from 'zod';
import { toJsonSchema, zodToOpenApi } from './zod-to-openapi.js';

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
              birthDate: {
                oneOf: [
                  { type: 'string', format: 'date-time' },
                  { type: 'string', format: 'date' },
                ],
              },
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
                      "^(?:[A-Za-z0-9_'+\\-]+\\.)*[A-Za-z0-9_'+\\-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9\\-]*\\.)+[A-Za-z]{2,}$",
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
  ])('should return the correct openapi schema for %$', ({ params, expected }) => {
    const result = zodToOpenApi(params);
    expect(result).toEqual(expected);
  });
});

describe('toJsonSchema', () => {
  const inputDate = {
    oneOf: [
      { type: 'string', format: 'date-time' },
      { type: 'string', format: 'date' },
    ],
  };
  const outputDate = { type: 'string', format: 'date-time' };

  test('input date is an ISO date-time or date', () => {
    const { schema } = toJsonSchema(z.coerce.date(), 'input');
    expect(schema).toEqual(inputDate);
    const parsed = z.fromJSONSchema(schema);
    expect(parsed.safeParse('2024-01-01').success).toBe(true);
    expect(parsed.safeParse('2024-01-01T10:00:00Z').success).toBe(true);
    expect(parsed.safeParse('Jan 1 2024').success).toBe(false);
  });

  test('output date is a date-time', () => {
    expect(toJsonSchema(z.date(), 'output').schema).toEqual({
      type: 'string',
      format: 'date-time',
    });
  });

  test('nullable input date nests', () => {
    const { schema } = toJsonSchema(z.object({ d: z.coerce.date().nullable() }), 'input');
    expect((schema as any).properties.d).toEqual({
      oneOf: [inputDate, { type: 'null' }],
    });
  });

  test.each(['input', 'output'] as const)('%s date keeps its own annotations', (io) => {
    const date = io === 'input' ? inputDate : outputDate;
    expect(toJsonSchema(z.date().describe('Birthday'), io).schema).toEqual({
      description: 'Birthday',
      ...date,
    });
    expect(
      toJsonSchema(
        z.coerce.date().meta({
          description: 'Birthday',
          examples: ['2024-01-01T00:00:00Z'],
          deprecated: true,
        }),
        io,
      ).schema,
    ).toEqual({
      description: 'Birthday',
      examples: ['2024-01-01T00:00:00Z'],
      deprecated: true,
      ...date,
    });
  });

  test('bigint without a type throws with its path', () => {
    expect(() => toJsonSchema(z.object({ b: z.bigint() }), 'input')).toThrow(
      'bigint cannot travel as JSON at properties.b; give it .meta({ type })',
    );
    expect(() => toJsonSchema(z.bigint(), 'input')).toThrow(
      'bigint cannot travel as JSON at (root); give it .meta({ type })',
    );
  });

  test('bigint whose meta type is on a wrapper throws, naming the fix', () => {
    const wrapped =
      'bigint cannot travel as JSON at properties.b; its .meta({ type }) ' +
      'must be on the z.bigint() itself, not on a wrapper';
    expect(() =>
      toJsonSchema(
        z.object({
          b: z
            .bigint()
            .optional()
            .meta({ type: 'string' } as any),
        }),
        'input',
      ),
    ).toThrow(wrapped);
    expect(() =>
      toJsonSchema(
        z.object({
          b: z
            .bigint()
            .nullable()
            .default(null)
            .meta({ type: 'string' } as any),
        }),
        'input',
      ),
    ).toThrow(wrapped);
  });

  test('bigint keeps its meta type', () => {
    const { schema } = toJsonSchema(
      z.object({ b: z.coerce.bigint().meta({ type: 'string' } as any) }),
      'input',
    );
    expect((schema as any).properties.b).toEqual({ type: 'string' });
  });

  test('unions are oneOf', () => {
    const { schema } = toJsonSchema(z.union([z.string(), z.number()]), 'input');
    expect(schema.oneOf).toBeDefined();
    expect(schema.anyOf).toBeUndefined();
  });

  test('meta id lands in components', () => {
    const { schema, components } = toJsonSchema(
      z.object({ a: z.object({ x: z.string() }).meta({ id: 'Addr' }) }),
      'input',
    );
    expect((schema as any).properties.a).toEqual({
      $ref: '#/components/schemas/Addr',
    });
    expect(components.Addr).toEqual({
      type: 'object',
      properties: { x: { type: 'string' } },
      required: ['x'],
    });
  });

  test('zod-openapi meta override still applies', () => {
    const { schema } = toJsonSchema(z.string().meta({ override: { format: 'email' } }), 'input');
    expect(schema.format).toBe('email');
  });

  test('ref names the schema', () => {
    const { schema, components } = toJsonSchema(z.object({}), 'output', 'XOutput');
    expect(schema).toEqual({ $ref: '#/components/schemas/XOutput' });
    expect(components.XOutput).toBeDefined();
  });
});
