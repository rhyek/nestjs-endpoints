import fs from 'node:fs/promises';
import path from 'node:path';
import { inspect } from 'node:util';
import type { ApplicationConfig, ModulesContainer } from '@nestjs/core';
import { collectDescriptors, filterDescriptors } from '../descriptors';
import { readOwnVersion } from '../package-json';
import { isWithin } from '../path-within';
import { stripExtension } from '../routing-files';
import { mergeSharedSchemas, reachableSchemas, rootsOf } from '../shared-schemas';
import { clientHash, printedTagDescriptions, readClientHash } from './hash';
// Types only: Kubb and the generators load when a client is generated.
import type { ReactQueryPluginOptions } from './kubb/generate';

/** One client generated from an app's endpoints. */
export type ClientOptions = {
  /** Where the client is written: a `.ts` or `.tsx` file. */
  outputFile: string;
  /**
   * Restrict this client's generated surface to endpoints whose
   * top-level namespace segment is one of the listed names.
   * When omitted, the client includes every endpoint (full-access).
   * An empty array is rejected as ambiguous — either omit
   * `namespaces` or list one or more segments.
   */
  namespaces?: string[];
} & (
  | {
      type: 'axios';
    }
  | {
      type: 'react-query';
      /**
       * Forwarded to the underlying `@kubb/plugin-react-query` generator —
       * customise query/mutation/suspense/infinite generation, query keys,
       * etc. The `client` option (HTTP-client wiring) is managed by
       * nestjs-endpoints and is omitted from this type.
       */
      options?: ReactQueryPluginOptions;
    }
);

/** The clients of an app, as `NestjsEndpoints.forRoot()` takes them: a list, or a function that returns one. */
export type ClientsOption = ClientOptions[] | (() => ClientOptions[] | Promise<ClientOptions[]>);

/**
 * The list `clients` gives, which calls it when it is a function. `of` names where they are
 * declared, such as `NestjsEndpoints.forRoot()`, in its errors.
 */
export async function resolveClients(clients: ClientsOption, of: string): Promise<ClientOptions[]> {
  const whose = `nestjs-endpoints: the \`clients\` of ${of}`;
  let resolved: unknown = clients;
  if (typeof clients === 'function') {
    try {
      resolved = await clients();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`${whose} threw: ${message}`, { cause: error });
    }
  }
  if (!Array.isArray(resolved)) {
    throw new Error(`${whose} are not a list of clients.`);
  }
  return resolved as ClientOptions[];
}

/** The parts of an app its clients are generated from. */
export type ClientSource = { modules: ModulesContainer; config: ApplicationConfig };

/** Refuses a list of clients that cannot be generated. `by` begins the message. */
function assertGenerable(clients: readonly ClientOptions[], by: string): void {
  const checked: { outputFile: string; resolved: string; folder: string }[] = [];
  for (const client of clients) {
    // Read as it is: a list from JavaScript, or from a function, holds anything.
    if (typeof (client as Partial<ClientOptions> | null | undefined)?.outputFile !== 'string') {
      throw new Error(
        `${by}: a client is an object with a "type" and an "outputFile"; got ${inspect(client, { breakLength: Infinity })}.`,
      );
    }
    const { outputFile, namespaces } = client;
    // Read as a string: comparing the union narrows the client to nothing.
    const type: string = client.type;
    if (type !== 'axios' && type !== 'react-query') {
      throw new Error(
        `${by}: the client "${outputFile}" has the type ${inspect(type)}; a client's type is ` +
          `"axios" or "react-query".`,
      );
    }
    if (namespaces !== undefined && namespaces.length === 0) {
      throw new Error(
        `${by}: client for "${outputFile}" has an empty ` +
          `namespaces filter. Either omit the field (include all ` +
          `operations) or list one or more top-level namespace segments.`,
      );
    }
    if (!path.extname(outputFile)) {
      throw new Error(
        `${by}: client "outputFile" must include a file extension ` +
          `(e.g. ".ts" or ".tsx"); got "${outputFile}". The generated ` +
          `tree is written to a sibling directory named after it, so an ` +
          `extensionless path would collide the wrapper file with its dir.`,
      );
    }
    // Each client's build removes from its folder what it did not write itself: no other
    // client's files may be there.
    const resolved = path.resolve(outputFile);
    const current = { outputFile, resolved, folder: stripExtension(resolved) };
    for (const other of checked) {
      if (other.resolved === resolved) {
        throw new Error(`${by}: two clients have the "outputFile" "${outputFile}".`);
      }
      if (other.folder === current.folder) {
        throw new Error(
          `${by}: the clients "${other.outputFile}" and "${outputFile}" are written to one folder.`,
        );
      }
      for (const [inner, outer] of [
        [current, other],
        [other, current],
      ]) {
        if (isWithin(inner.resolved, outer.folder)) {
          throw new Error(
            `${by}: the client "${inner.outputFile}" is inside the folder of the client "${outer.outputFile}".`,
          );
        }
      }
    }
    checked.push(current);
  }
}

/**
 * Writes the `clients` of an app, each only when what it is generated from changed or its
 * output is missing, or every one of them when forced. Resolves to the clients it wrote. `by`
 * names the caller in its errors.
 */
export async function generateClients(
  app: ClientSource,
  clients: readonly ClientOptions[],
  { force = false, by }: { force?: boolean; by: string },
): Promise<ClientOptions[]> {
  assertGenerable(clients, by);

  const version = readOwnVersion();

  // Shared schemas are named from every endpoint of the app, so a schema has
  // the same name in every client, whatever its namespaces.
  const descriptors = collectDescriptors(app.modules, app.config);
  const shared = mergeSharedSchemas(descriptors);

  const pathExists = (p: string) =>
    fs
      .stat(p)
      .then(() => true)
      .catch(() => false);

  const written = await Promise.all(
    clients.map(async (client) => {
      const clientDescriptors = filterDescriptors(descriptors, client.namespaces);
      const hash = clientHash({
        descriptors: clientDescriptors,
        shared: reachableSchemas(
          clientDescriptors.flatMap((d) => rootsOf(d, shared.renamed)),
          shared,
        ),
        tagDescriptions: printedTagDescriptions(clientDescriptors),
        client: {
          type: client.type,
          namespaces: client.namespaces,
          options: client.type === 'react-query' ? client.options : undefined,
        },
        version,
      });
      // A missing wrapper (no hash to read) or output directory regenerates
      // the client, so a partially deleted tree heals even when nothing else
      // changed.
      const [currentHash, outDirExists] = await Promise.all([
        readClientHash(client.outputFile),
        pathExists(stripExtension(client.outputFile)),
      ]);
      if (!force && outDirExists && currentHash === hash) {
        return false;
      }
      try {
        const { generateAxiosClient, generateReactQueryClient } = await import('./kubb/generate');
        if (client.type === 'axios') {
          await generateAxiosClient({
            descriptors: clientDescriptors,
            shared,
            outputFile: client.outputFile,
            hash,
          });
        } else {
          await generateReactQueryClient({
            descriptors: clientDescriptors,
            shared,
            outputFile: client.outputFile,
            options: client.options,
            hash,
          });
        }
      } catch (err) {
        // Kubb can write the wrapper, with its new hash, before the build
        // reports the error. Removing it makes the next run regenerate the
        // client and report the error again.
        await fs.rm(client.outputFile, { force: true });
        throw new Error(
          `${by}: failed to generate the ${client.type} client ` +
            `"${client.outputFile}": ${buildFailure(err)}`,
          { cause: err },
        );
      }
      return true;
    }),
  );
  return clients.filter((_, index) => written[index]);
}

/**
 * What failed a client's build. Kubb's build throws an `AggregateError` of every plugin's error,
 * whose own message only counts them: each one's message is what failed.
 */
function buildFailure(err: unknown): string {
  const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));
  return err instanceof AggregateError && err.errors.length > 0
    ? err.errors.map(messageOf).join('; ')
    : messageOf(err);
}
