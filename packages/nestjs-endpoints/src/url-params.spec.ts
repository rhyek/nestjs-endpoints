import { operationName, pathFolders, toOpenApiPath, urlParamNames } from './url-params';

// Each as the router reads it, and as `@nestjs/swagger` writes it in a document's `paths`.
const urls = [
  {
    is: 'a parameter that is a whole segment',
    url: '/recipes/:recipeId/view',
    params: ['recipeId'],
    openApi: '/recipes/{recipeId}/view',
    name: 'RecipesView',
    folders: ['recipes'],
  },
  {
    is: 'parameters at both ends',
    url: '/:tenantId/recipes/edit/:recipeId',
    params: ['tenantId', 'recipeId'],
    openApi: '/{tenantId}/recipes/edit/{recipeId}',
    name: 'RecipesEdit',
    folders: ['recipes', 'edit'],
  },
  {
    is: 'no parameter',
    url: '/user-profile/get_all',
    params: [],
    openApi: '/user-profile/get_all',
    name: 'UserProfileGet_all',
    folders: ['user-profile'],
  },
  {
    is: 'a parameter with text after it',
    url: '/files/:name.json',
    params: ['name'],
    openApi: '/files/{name}.json',
    name: 'FilesJson',
    folders: ['files'],
  },
  {
    is: 'two parameters in a segment',
    url: '/moves/:fromId-:toId',
    params: ['fromId', 'toId'],
    openApi: '/moves/{fromId}-{toId}',
    name: 'Moves',
    folders: ['moves'],
  },
  {
    is: 'a wildcard',
    url: '/files/*rest',
    params: ['rest'],
    openApi: '/files/{rest}',
    name: 'Files',
    folders: ['files'],
  },
  {
    is: 'a part that may be left out',
    url: '/files{/:folder}/list',
    params: ['folder'],
    openApi: '/files/{folder}/list',
    name: 'FilesList',
    folders: ['files'],
  },
  {
    is: 'a parameter with a quoted name',
    url: '/files/:"file-name"/view',
    params: ['file-name'],
    openApi: '/files/{file-name}/view',
    name: 'FilesView',
    folders: ['files'],
  },
  {
    is: 'text that only looks like a parameter',
    url: String.raw`/time/12\:30/:zone`,
    params: ['zone'],
    openApi: '/time/12:30/{zone}',
    name: 'Time12:30',
    folders: ['time', '12:30'],
  },
  {
    is: 'a longer name that starts as another',
    url: '/files/:names',
    params: ['names'],
    openApi: '/files/{names}',
    name: 'Files',
    folders: ['files'],
  },
];

describe.each(urls)('a URL with $is', ({ url, params, openApi, name, folders }) => {
  test('names its parameters, in order', () => {
    expect(urlParamNames(url)).toEqual(params);
  });

  test('is an OpenAPI path with each parameter in braces', () => {
    expect(toOpenApiPath(url)).toBe(openApi);
  });

  test('gives its operation a name without its parameters', () => {
    expect(operationName(url)).toBe(name);
  });

  test('has folders, without its parameters and its last segment', () => {
    expect(pathFolders(url)).toEqual(folders);
  });
});
