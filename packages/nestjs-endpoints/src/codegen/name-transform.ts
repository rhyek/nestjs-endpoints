/**
 * Convert a kebab-or-mixed string segment into a PascalCase token so it
 * can be matched against (or stripped from) a flat orval-generated name.
 * Matches the rules used by `getHttpPathPascalName` in helpers.ts.
 */
function segmentToPascal(segment: string): string {
  return segment
    .replace(/^[a-z]/, (c) => c.toUpperCase())
    .replace(/[/-]([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

/**
 * Strip the namespace chain's PascalCase prefix from an orval-generated
 * flat function / hook name. The transform is lenient: if the flat name
 * does not begin with the expected tokens, the original name is returned
 * unchanged.
 *
 * Rules:
 * - If the name starts with `use` (React Query hook), the prefix is
 *   preserved and the strip happens on the remainder.
 * - The namespace chain is concatenated as a single PascalCase prefix
 *   (e.g., `['clinica', 'horarios', 'general']` → `ClinicaHorariosGeneral`)
 *   and that prefix is stripped if present. Partial matches are not
 *   stripped — the full prefix must match.
 * - After stripping, the remainder's first letter is lower-cased (so
 *   `AseguradoraListar` → `aseguradoraListar`), except when a `use`
 *   prefix is re-attached, in which case the remainder stays
 *   PascalCase (so `use` + `SemanaActualizar` → `useSemanaActualizar`).
 * - If stripping would leave an empty remainder, the original flat
 *   name is returned unchanged (same lenient fallback as a non-match).
 */
export function stripNamespaceFromFlatName(
  flatName: string,
  namespaceChain: string[],
): string {
  if (namespaceChain.length === 0) return flatName;

  const hasUsePrefix = /^use[A-Z]/.test(flatName);
  const rawBody = hasUsePrefix ? flatName.slice(3) : flatName;
  // Orval emits plain fns as camelCase (`userCreate`) and hooks as
  // `use` + PascalCase (`useUserCreate`). Normalize to PascalCase so a
  // single prefix-match handles both forms.
  const body = rawBody.charAt(0).toUpperCase() + rawBody.slice(1);

  const prefix = namespaceChain.map(segmentToPascal).join('');
  if (!body.startsWith(prefix)) {
    // Lenient: leave the name alone when it doesn't begin with the chain.
    return flatName;
  }

  const tail = body.slice(prefix.length);
  // Next char after the stripped prefix must be an uppercase letter
  // (PascalCase word boundary). If it isn't, the match was only partial
  // within a token (e.g. chain `['user']` vs body `UserneamesList`),
  // so leave the name alone.
  if (tail.length > 0 && !/^[A-Z0-9]/.test(tail)) {
    return flatName;
  }
  if (tail.length === 0) {
    // Full-match strip would erase the name entirely — leave it alone.
    return flatName;
  }

  if (hasUsePrefix) {
    return 'use' + tail;
  }
  return tail.charAt(0).toLowerCase() + tail.slice(1);
}
