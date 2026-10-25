import fs from 'node:fs/promises';
import path from 'node:path';
import { INestApplication } from '@nestjs/common';
import type { OpenAPIObject } from '@nestjs/swagger';
import { collectDescriptors, filterDescriptors } from '../descriptors.js';
import { readPkgJson } from '../package-json.js';
import { setupOpenAPI, SetupOpenAPIOptions } from '../setup-openapi.js';
import {
  mergeSharedSchemas,
  reachableSchemas,
} from '../shared-schemas.js';
import { clientHash, readClientHash } from './hash.js';
import { rootsOf } from './kubb/adapter.js';
import {
  generateAxiosClient,
  generateReactQueryClient,
  outputDirFor,
  type ReactQueryPluginOptions,
} from './kubb/generate.js';
import { printedTagDescriptions } from './kubb/wrapper.js';

export async function setupCodegen(
  app: INestApplication,
  params: {
    /**
     * When given, the OpenAPI document is built as `setupOpenAPI` does:
     * written to `outputFile` and/or served at `ui.path`, when they are set.
     * The clients are generated from the endpoints either way.
     */
    openapi?: SetupOpenAPIOptions;
    clients: ({
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
    ))[];
    /**
     * If true, every client is regenerated, even when its output exists and
     * nothing it is generated from has changed.
     */
    forceGenerate?: boolean | undefined;
  },
): Promise<{ document?: OpenAPIObject }> {
  for (const client of params.clients) {
    if (
      client.namespaces !== undefined &&
      client.namespaces.length === 0
    ) {
      throw new Error(
        `setupCodegen: client for "${client.outputFile}" has an empty ` +
          `namespaces filter. Either omit the field (include all ` +
          `operations) or list one or more top-level namespace segments.`,
      );
    }
    if (!path.extname(client.outputFile)) {
      throw new Error(
        `setupCodegen: client "outputFile" must include a file extension ` +
          `(e.g. ".ts" or ".tsx"); got "${client.outputFile}". The generated ` +
          `tree is written to a sibling directory named after it, so an ` +
          `extensionless path would collide the wrapper file with its dir.`,
      );
    }
  }

  // Read here, not in a callback: it finds the package from the call stack.
  const version = (await readPkgJson())?.version ?? '1';
  if (params.forceGenerate) {
    // Wipe every client artifact this call owns so the generators start from
    // an empty slate: each client's wrapper `outputFile` and its sibling Kubb
    // output directory.
    const ignore = () => {
      /* ignore if it doesn't exist */
    };
    await Promise.all(
      params.clients.flatMap((client) => [
        fs.unlink(client.outputFile).catch(ignore),
        fs
          .rm(outputDirFor(client.outputFile), {
            recursive: true,
            force: true,
          })
          .catch(ignore),
      ]),
    );
  }
  const document = params.openapi
    ? (await setupOpenAPI(app, params.openapi)).document
    : undefined;

  // Shared schemas are named from every endpoint of the app, so a schema has
  // the same name in every client, whatever its namespaces.
  const descriptors = collectDescriptors(app);
  const shared = mergeSharedSchemas(descriptors);

  const pathExists = (p: string) =>
    fs
      .stat(p)
      .then(() => true)
      .catch(() => false);

  await Promise.all(
    params.clients.map(async (client) => {
      const clientDescriptors = filterDescriptors(
        descriptors,
        client.namespaces,
      );
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
          options:
            client.type === 'react-query' ? client.options : undefined,
        },
        version,
      });
      // A missing wrapper (no hash to read) or output directory regenerates
      // the client, so a partially deleted tree heals even when nothing else
      // changed.
      const [currentHash, outDirExists] = await Promise.all([
        readClientHash(client.outputFile),
        pathExists(outputDirFor(client.outputFile)),
      ]);
      if (!params.forceGenerate && outDirExists && currentHash === hash) {
        return;
      }
      try {
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
        await fs.unlink(client.outputFile).catch(() => {
          /* ignore if it doesn't exist */
        });
        throw new Error(
          `setupCodegen: failed to generate the ${client.type} client ` +
            `"${client.outputFile}": ${(err as Error).message}`,
          { cause: err },
        );
      }
    }),
  );

  return { document };
}
