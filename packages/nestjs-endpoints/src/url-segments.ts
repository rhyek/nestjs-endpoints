// How a file or folder name reads as URL segments, in file-based routing.

/**
 * Expand one filename-derived path segment into one or more URL segments.
 *
 * - Splits on `.` so `$id.view` → `[$id, view]` and `$id.delete` →
 *   `[$id, delete]`. This is what lets a single folder or file express a
 *   URL with a path parameter inline (e.g., `recipes/$id.delete.endpoint.ts`
 *   → `recipes/:id/delete`).
 * - Subsegments starting with `$` become `:` parameters: `$id` → `:id`.
 *
 * Empty pieces are dropped, which gracefully handles oddities like a
 * leading or trailing `.`.
 */
export function expandUrlSegment(segment: string): string[] {
  return segment
    .split('.')
    .filter(Boolean)
    .map((sub) => (sub.startsWith('$') ? ':' + sub.slice(1) : sub));
}

/** Whether a folder's name has a path parameter in it: `$clinicId`, `$clinicId.visits`. */
export function namesPathParam(folder: string): boolean {
  return folder.split('.').some((sub) => sub.startsWith('$'));
}

/**
 * A folder of a router's inferred base path, as URL segments. A folder that
 * names a path parameter reads as it does in an endpoint's path
 * (`$clinicId.visits` → `:clinicId/visits`); any other is one segment, as it
 * is named.
 */
export function routerFolderSegments(folder: string): string[] {
  return namesPathParam(folder) ? expandUrlSegment(folder) : [folder];
}
