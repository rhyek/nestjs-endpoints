import type { OpenAPIObject } from '@nestjs/swagger';

const HTTP_METHODS = new Set([
  'get',
  'post',
  'put',
  'delete',
  'patch',
  'head',
  'options',
  'trace',
]);

/**
 * Produce a copy of `doc` that contains only operations whose top-level
 * `x-namespace` segment is in `allowedTopNamespaces`. When
 * `allowedTopNamespaces` is `undefined`, the doc is returned unchanged
 * (full-access client). After filtering paths, `components.schemas` is
 * pruned to keep only schemas reachable by $ref from the remaining
 * paths (and transitively from other retained schemas).
 */
export function filterOpenApiDocByNamespaces(
  doc: OpenAPIObject,
  allowedTopNamespaces: string[] | undefined,
): OpenAPIObject {
  if (allowedTopNamespaces === undefined) {
    return doc;
  }
  const allowed = new Set(allowedTopNamespaces);
  const filteredPaths: Record<string, any> = {};
  for (const [pathKey, pathItem] of Object.entries(doc.paths ?? {})) {
    if (!pathItem || typeof pathItem !== 'object') continue;
    const keptItem: Record<string, any> = {};
    for (const [key, value] of Object.entries(pathItem)) {
      if (!HTTP_METHODS.has(key)) {
        // Carry forward non-operation keys (parameters, summary, etc.).
        keptItem[key] = value;
        continue;
      }
      const op = value as { ['x-namespace']?: unknown };
      const ns = op?.['x-namespace'];
      if (!Array.isArray(ns) || ns.length === 0) continue;
      const top = ns[0];
      if (typeof top !== 'string' || !allowed.has(top)) continue;
      keptItem[key] = value;
    }
    const hasOperations = Object.keys(keptItem).some((k) =>
      HTTP_METHODS.has(k),
    );
    if (hasOperations) {
      filteredPaths[pathKey] = keptItem;
    }
  }

  // Collect $refs reachable from the filtered paths. Schemas referenced
  // transitively (schema A → schema B) are included.
  const reachable = new Set<string>();
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (k === '$ref' && typeof v === 'string') {
        const match = v.match(/^#\/components\/schemas\/(.+)$/);
        if (match && !reachable.has(match[1])) {
          reachable.add(match[1]);
          const schema = doc.components?.schemas?.[match[1]];
          if (schema) walk(schema);
        }
      } else {
        walk(v);
      }
    }
  };
  walk(filteredPaths);

  const prunedSchemas: Record<string, any> = {};
  for (const name of reachable) {
    const schema = doc.components?.schemas?.[name];
    if (schema) prunedSchemas[name] = schema;
  }

  return {
    ...doc,
    paths: filteredPaths,
    components: {
      ...doc.components,
      schemas: prunedSchemas,
    },
  };
}
