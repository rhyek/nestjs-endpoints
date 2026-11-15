import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import type { EndpointDescriptor } from '../descriptors.js';
import { settings } from '../settings.js';
import { sortedCopy } from '../shared-schemas.js';
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
  return createHash('sha256')
    .update(JSON.stringify(sortedCopy(params)))
    .digest('hex');
}

/**
 * The descriptions router modules give their namespaces, keyed by the chain
 * joined with `/`, written above each namespace bucket.
 */
export function tagDescriptions(): Map<string, string> {
  return new Map(settings.openapi.tags.map(({ name, description }) => [name, description]));
}

/**
 * The descriptions a wrapper for `descriptors` writes above its buckets:
 * those of every namespace chain, and each of its prefixes, the descriptors
 * sit under. Keyed like `descriptions`.
 */
export function printedTagDescriptions(
  descriptors: readonly EndpointDescriptor[],
  descriptions: ReadonlyMap<string, string> = tagDescriptions(),
): Record<string, string> {
  const printed: Record<string, string> = {};
  for (const { namespaceChain } of descriptors) {
    for (let i = 1; i <= namespaceChain.length; i++) {
      const key = namespaceChain.slice(0, i).join('/');
      const description = descriptions.get(key);
      if (description) {
        printed[key] = description;
      }
    }
  }
  return printed;
}

/**
 * The hash in the first line of the wrapper at `outputFile`; `undefined` when
 * the file or its header is missing.
 */
export async function readClientHash(outputFile: string): Promise<string | undefined> {
  const source = await fs.readFile(outputFile, 'utf-8').catch(() => '');
  return headerPattern.exec(source.split('\n', 1)[0])?.[1];
}
