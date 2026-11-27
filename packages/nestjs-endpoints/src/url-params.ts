// How a URL's path parameters read, as the router (path-to-regexp 8) reads them, and as
// `@nestjs/swagger` writes them in a document's `paths`.

/** A path without the slashes at its ends: `/venues/` is `venues`. */
export const trimSlashes = (path: string) => path.replace(/^\/+|\/+$/g, '');

/**
 * A piece of a URL: a character after a backslash, which is itself; a parameter (`:name`)
 * or a wildcard (`*name`), its name bare or in quotes; a brace of a part that may be left
 * out; or text.
 */
const URL_PIECE =
  /\\(.)|[:*](?:"([^"]*)"|([\p{ID_Start}$_][\p{ID_Continue}$]*))|[{}]|[^\\:*{}]+|[:*]/gsu;

/** A piece of a URL, as `urlTokens` reads it. */
export type UrlToken =
  | { text: string }
  | { param: string; wildcard: boolean }
  | { brace: '{' | '}' };

/**
 * The pieces of a URL, in order: text, parameters and wildcards, and the braces of a part that
 * may be left out.
 */
export function urlTokens(url: string): UrlToken[] {
  return [...url.matchAll(URL_PIECE)].map(([piece, escaped, quoted, bare]): UrlToken => {
    const param = quoted ?? bare;
    if (param !== undefined) {
      return { param, wildcard: piece.startsWith('*') };
    }
    return piece === '{' || piece === '}' ? { brace: piece } : { text: escaped ?? piece };
  });
}

/** A piece of a URL but a brace: text, or a parameter or a wildcard. */
export type UnbracedToken = Exclude<UrlToken, { brace: string }>;

/** A URL's text and parameters, a wildcard among them, without the braces of its parts. */
const unbracedTokens = (url: string) =>
  urlTokens(url).filter((token): token is UnbracedToken => !('brace' in token));

/** The path parameters a URL names, in the order it has them. */
export function urlParamNames(url: string): string[] {
  return unbracedTokens(url).flatMap((token) => ('param' in token ? [token.param] : []));
}

/** `/recipes/:recipeId/view` → `/recipes/{recipeId}/view`. */
export function toOpenApiPath(url: string): string {
  return unbracedTokens(url)
    .map((token) => ('param' in token ? `{${token.param}}` : token.text))
    .join('');
}

/**
 * The segments of a URL without their parameters: `/files/:name.json/view` →
 * `['files', 'json', 'view']`. A segment that is only a parameter is none, and what is
 * left of one that has a parameter loses the punctuation that set the parameter apart.
 * `leaf` tells whether the URL's last segment is among them.
 */
function wordsOf(url: string): { words: string[]; leaf: boolean } {
  const segments: { text: string; hasParam: boolean }[] = [{ text: '', hasParam: false }];
  for (const token of unbracedTokens(url)) {
    if ('param' in token) {
      segments.at(-1)!.hasParam = true;
      continue;
    }
    const [first, ...rest] = token.text.split('/');
    segments.at(-1)!.text += first;
    segments.push(...rest.map((text) => ({ text, hasParam: false })));
  }
  const word = ({ text, hasParam }: (typeof segments)[number]) =>
    hasParam ? text.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '') : text;
  return {
    words: segments.map(word).filter(Boolean),
    leaf: word(segments.at(-1)!) !== '',
  };
}

/**
 * The name of the operation a URL serves: `/recipes/edit/:recipeId` → `RecipesEdit`. Its
 * parameters are left out: the generated clients take them as a typed `path` group, so
 * repeating their names in the method's would only be noise. A URL with no word in it, as `/`
 * or `/:id`, is the API's root, `Root`: a client has a function for each name.
 */
export function operationName(url: string): string {
  const { words } = wordsOf(url);
  if (words.length === 0) {
    return 'Root';
  }
  return words
    .join('/')
    .replace(/^[a-z]/, (letter) => letter.toUpperCase())
    .replace(/[/-]([a-z0-9])/g, (_, char: string) => char.toUpperCase());
}

/** The folders a URL is in: its segments but the last, without its parameters. */
export function pathFolders(url: string): string[] {
  const { words, leaf } = wordsOf(url);
  return leaf ? words.slice(0, -1) : words;
}
