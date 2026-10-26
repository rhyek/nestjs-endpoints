import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import type { EndpointDescriptor } from '../descriptors.js';
import type { JsonSchema } from '../zod-to-openapi.js';

/**
 * Change detection for generated clients: a hash of everything a client is
 * generated from, written as the first line of its wrapper.
 */

// A leading BOM and a CRLF line ending are an editor's or a checkout's.
const headerPattern = /^\uFEFF?\/\/ nestjs-endpoints: ([0-9a-f]{64})\r?$/;

/** The wrapper's first line, carrying `hash`. */
export function hashHeader(hash: string): string {
  return `// nestjs-endpoints: ${hash}\n`;
}

/**
 * JSON with sorted keys. Functions and regular expressions, which JSON drops,
 * are written as their source, so a change to a pattern or a callback in a
 * client's options changes the hash.
 */
function canonical(value: unknown): unknown {
  if (typeof value === 'function' || value instanceof RegExp) {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map(canonical);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, canonical(v)]),
    );
  }
  return value;
}

/**
 * The sha256 (hex) of a client's descriptors, the shared schemas they reach,
 * the namespace descriptions its wrapper prints, its config and the
 * nestjs-endpoints version.
 */
export function clientHash(params: {
  descriptors: EndpointDescriptor[];
  shared: Record<string, JsonSchema>;
  /** Namespace chain (joined with `/`) → the description above its bucket. */
  tagDescriptions?: Record<string, string>;
  client: { type: string; namespaces?: string[]; options?: unknown };
  version: string;
}): string {
  const { descriptors, shared, tagDescriptions, client, version } = params;
  return createHash('sha256')
    .update(
      JSON.stringify(
        canonical({
          descriptors,
          shared,
          tagDescriptions,
          client: {
            type: client.type,
            namespaces: client.namespaces,
            options: client.options,
          },
          version,
        }),
      ),
    )
    .digest('hex');
}

/**
 * The hash in the first line of the wrapper at `outputFile`; `undefined` when
 * the file or its header is missing.
 */
export async function readClientHash(outputFile: string): Promise<string | undefined> {
  const source = await fs.readFile(outputFile, 'utf-8').catch(() => '');
  return headerPattern.exec(source.split('\n', 1)[0])?.[1];
}
