import z from 'zod';
import { zodToOpenApi } from './zod-to-openapi';

describe('zodToOpenApi', () => {
  test.each([
    {
      params: {
        schema: z.object({
          name: z.string(),
          birthDate: z.coerce.date(),
        }),
        ref: 'User',
        schemaType: 'input' as const,
      },
      expected: {
        openApiSchema: {
          $ref: '#/components/schemas/User',
        },
        components: {
          User: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              birthDate: { type: 'string' },
            },
            required: ['name', 'birthDate'],
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
        }),
        ref: 'UserOutput',
        schemaType: 'output' as const,
      },
      expected: {
        openApiSchema: {
          $ref: '#/components/schemas/UserOutput',
        },
        components: {
          UserOutput: {
            type: 'object',
            properties: {
              birthDate: { type: 'string', format: 'date-time' },
            },
            required: ['birthDate'],
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
  ])(
    'should return the correct openapi schema for %$',
    ({ params, expected }) => {
      const result = zodToOpenApi(params);
      expect(result).toEqual(expected);
    },
  );
});
