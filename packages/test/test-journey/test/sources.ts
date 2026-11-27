import { API_PORT } from './ports';

// What the developer types, step by step: the files of the two apps as the journey leaves them.

/**
 * `apps/api/src/app.module.ts`, once nestjs-endpoints is set up in it. With `library`, its root
 * router lists the library's, at `libraryAt` if given, and gives it the greeter it expects.
 */
export const appModule = ({
  onStart = true,
  library = false,
  libraryAt,
}: {
  onStart?: boolean;
  library?: boolean;
  libraryAt?: string;
} = {}) => `import path from 'node:path';
import { ${library ? 'Injectable, ' : ''}Module } from '@nestjs/common';
import { NestjsEndpoints } from 'nestjs-endpoints';${
  library
    ? `
import { type Greeter, sharedRouter } from 'shared-backend';

@Injectable()
class ApiGreeter implements Greeter {
  greet(name: string) {
    return 'hello, ' + name;
  }
}`
    : ''
}

@Module({
  imports: [
    NestjsEndpoints.forRoot({
      router: ${
        library
          ? `{
        rootDirectory: './endpoints',
        providers: [ApiGreeter],
        context: { inject: { greeter: ApiGreeter } },
        routers: [${libraryAt ? `sharedRouter.register({ basePath: '${libraryAt}' })` : 'sharedRouter'}],
      }`
          : "{ rootDirectory: './endpoints' }"
      },
      clients: () => {
        ${onStart ? '' : "console.log('clients() was called');\n        "}const web = path.join(import.meta.dirname, '../../web/src');
        return [{ type: 'react-query', outputFile: path.join(web, 'api-client.tsx') }];
      },${onStart ? '' : '\n      generateClientsOnStart: false,'}
    }),
  ],
})
export class AppModule {}
`;

/**
 * `libs/shared-backend/package.json`: a package of the workspace that builds to a folder of its
 * own. It has the package among its own dependencies, with a version of Zod the API does not
 * have, so the package manager gives it a copy of its own: the app then runs two.
 */
export const libraryPackage = (nestjsEndpoints: string, zod: string) =>
  JSON.stringify(
    {
      name: 'shared-backend',
      version: '0.0.1',
      private: true,
      type: 'module',
      exports: { '.': { types: './dist/index.d.ts', default: './dist/index.js' } },
      scripts: {
        build: 'tsc -p tsconfig.json',
        dev: 'tsc -p tsconfig.json --watch --preserveWatchOutput',
      },
      dependencies: { 'nestjs-endpoints': `file:${nestjsEndpoints}`, zod },
      // The app's own NestJS: an endpoint's type names one of its types.
      peerDependencies: { '@nestjs/common': '^12.4.0' },
      devDependencies: { '@types/node': '^24.0.0', typescript: '^6.0.2' },
    },
    null,
    2,
  ) + '\n';

/** `libs/shared-backend/tsconfig.json`. */
export const libraryTsconfig =
  JSON.stringify(
    {
      compilerOptions: {
        module: 'nodenext',
        moduleResolution: 'nodenext',
        target: 'ES2023',
        declaration: true,
        outDir: './dist',
        rootDir: './src',
        strict: true,
        skipLibCheck: true,
        types: ['node'],
      },
      include: ['src'],
    },
    null,
    2,
  ) + '\n';

/**
 * `libs/shared-backend/src/index.ts`: a router of endpoints the monorepo's APIs share. It says
 * what its endpoints are given, and each API says how.
 */
export const libraryRouter = `import { EndpointRouter } from 'nestjs-endpoints';

export interface Greeter {
  greet(name: string): string;
}

export const sharedRouter = EndpointRouter.create({
  rootDirectory: './endpoints',
  basePath: 'shared',
  namespace: 'shared',
  expects: { greeter: EndpointRouter.given<Greeter>() },
});
`;

/** `greetings.endpoint.ts` of the library: what the API's greeter says to each of `names`. */
export const greetingsEndpoint = (
  names = ['ada', 'grace'],
) => `import { z } from 'nestjs-endpoints';
import { sharedRouter } from '../index.js';

export default sharedRouter.endpoint.query({
  output: z.array(z.object({ name: z.string(), text: z.string() })),
  handler: ({ greeter }) =>
    [${names.map((name) => `'${name}'`).join(', ')}].map((name) => ({ name, text: greeter.greet(name) })),
});
`;

/** An endpoint of the library the page never calls. */
export const farewellEndpoint = `import { endpoint, z } from 'nestjs-endpoints';

export default endpoint.query({
  output: z.object({ text: z.string() }),
  handler: () => ({ text: 'goodbye' }),
});
`;

/** The home page, listing what the library's endpoint greets with: `hook` is how it reaches it. */
export const greetingsHomePage = (
  hook = 'useGreetings',
) => `import { createFileRoute } from '@tanstack/react-router'
import { useApiClient } from '../api-client'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  const client = useApiClient()
  const greetings = client.shared.${hook}()
  return (
    <main>
      <h1>Greetings</h1>
      <ul>
        {greetings.data?.map((greeting) => (
          <li key={greeting.name}>{greeting.text}</li>
        ))}
      </ul>
    </main>
  )
}
`;

/** A function that is no endpoint, default-exported where an endpoint would be: never called. */
export const unrelatedCode = `export default function thisIsATest() {
  console.error("shouldn't run");
}
`;

type Fruit = [name: string, color: string];
const apples: Fruit[] = [
  ['apple', 'red'],
  ['banana', 'yellow'],
  ['lime', 'green'],
];

/** `fruits/list.endpoint.ts`: three fruits, each with its name and the key `color` names. */
export const listEndpoint = ({
  color = 'color',
  fruits = apples,
}: { color?: string; fruits?: Fruit[] } = {}) => `import { endpoint, z } from 'nestjs-endpoints';

export default endpoint.query({
  output: z.array(z.object({ name: z.string(), ${color}: z.string() })),
  handler: () => [
${fruits.map(([name, value]) => `    { name: '${name}', ${color}: '${value}' },`).join('\n')}
  ],
});
`;

/** An endpoint the page never calls. */
export const healthEndpoint = `import { endpoint, z } from 'nestjs-endpoints';

export default endpoint.query({
  method: 'get',
  output: z.object({ ok: z.boolean() }),
  handler: () => ({ ok: true }),
});
`;

export const namespacedRouter = `import { EndpointRouter } from 'nestjs-endpoints';

export default EndpointRouter.create({ namespace: true });
`;

/** The fruits the endpoints share, once one of them adds to the list. */
export const fruitsStore = `export const fruits = [
  { name: 'apple', color: 'red' },
  { name: 'banana', color: 'yellow' },
  { name: 'lime', color: 'green' },
];
`;

export const storedListEndpoint = `import { endpoint, z } from 'nestjs-endpoints';
import { fruits } from './store.js';

export default endpoint.query({
  output: z.array(z.object({ name: z.string(), color: z.string() })),
  handler: () => fruits,
});
`;

export const addEndpoint = `import { endpoint, z } from 'nestjs-endpoints';
import { fruits } from './store.js';

export default endpoint.mutation({
  input: z.object({ name: z.string(), color: z.string() }),
  output: z.object({ count: z.number() }),
  handler: ({ input }) => {
    fruits.push(input);
    return { count: fruits.length };
  },
});
`;

/** `apps/web/src/routes/__root.tsx`, with the generated client provided to every route. */
export const rootRoute = `import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Outlet, createRootRoute } from '@tanstack/react-router'
import { ApiClientProvider, createApiClient } from '../api-client'

const queryClient = new QueryClient()
const api = createApiClient({ baseURL: 'http://localhost:${API_PORT}' })

export const Route = createRootRoute({
  component: RootComponent,
})

function RootComponent() {
  return (
    <QueryClientProvider client={queryClient}>
      <ApiClientProvider client={api}>
        <Outlet />
      </ApiClientProvider>
    </QueryClientProvider>
  )
}
`;

/** `apps/web/src/routes/index.tsx`: a home page that calls no endpoint. */
export const emptyHomePage = `import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  return (
    <main>
      <h1>Home</h1>
    </main>
  )
}
`;

/**
 * The home page, listing the fruits a query hook returns: `hook` is how the page reaches it
 * from the client, and `color` the key it reads.
 */
export const fruitsHomePage = ({
  hook,
  color = 'color',
}: {
  hook: string;
  color?: string;
}) => `import { createFileRoute } from '@tanstack/react-router'
import { useApiClient } from '../api-client'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  const client = useApiClient()
  const fruits = client.${hook}()
  return (
    <main>
      <h1>Fruits</h1>
      <ul>
        {fruits.data?.map((fruit) => (
          <li key={fruit.name}>
            {fruit.name} is {fruit.${color}}
          </li>
        ))}
      </ul>
    </main>
  )
}
`;

/** The home page with a button that adds a fruit, then asks for the list again. */
export const addingHomePage = ({
  hook = 'fruits.useList',
  color = 'color',
}: {
  hook?: string;
  color?: string;
} = {}) => `import { createFileRoute } from '@tanstack/react-router'
import { useApiClient } from '../api-client'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  const client = useApiClient()
  const fruits = client.${hook}()
  const add = client.fruits.useAdd({
    mutation: { onSuccess: () => fruits.refetch() },
  })
  return (
    <main>
      <h1>Fruits</h1>
      <ul>
        {fruits.data?.map((fruit) => (
          <li key={fruit.name}>
            {fruit.name} is {fruit.color}
          </li>
        ))}
      </ul>
      <button
        onClick={() => add.mutate({ body: { name: 'mango', ${color}: 'orange' } })}
      >
        Add a mango
      </button>
    </main>
  )
}
`;
