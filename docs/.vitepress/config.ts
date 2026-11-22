import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rendererFloatingVue, transformerTwoslash } from '@shikijs/vitepress-twoslash';
import ts from 'typescript';
import { defineConfig } from 'vitepress';
import llmstxt from 'vitepress-plugin-llms';

const repo = 'https://github.com/rhyek/nestjs-endpoints';
const site = 'https://nestjs-endpoints.dev';

// The app the site's code samples are type-checked against (docs/snippets/): its endpoints, and
// the clients generated from them by `pnpm snippets`. A sample marked `twoslash` is compiled as a
// file in that folder, so it imports `./src/…` and `./generated/…` as that app's own code would.
//
// A sample that needs to sit in a folder of that app, for its relative imports, names itself
// `// @filename: src/…/<name>.sample.ts`. The name must not be a file that exists: a sample's
// file replaces a real one of the same path, for every sample compiled after it too.
//
// No trailing slash: with one, Twoslash reports no compiler errors.
const snippets = fileURLToPath(new URL('../snippets', import.meta.url));

// The samples compile with that app's own compiler options (docs/snippets/tsconfig.json).
const { options: compilerOptions } = ts.parseJsonConfigFileContent(
  ts.readConfigFile(path.join(snippets, 'tsconfig.json'), (file) => ts.sys.readFile(file)).config,
  ts.sys,
  snippets,
);

// The dev server answers only localhost unless DOCS_PUBLIC_ORIGIN names the origin of a TLS
// terminator in front of it (`DOCS_PUBLIC_ORIGIN=https://docs.example.test pnpm docs:dev`): it
// then accepts that host too. Live reload needs no setting: the page connects to the port it
// was loaded from, which is the terminator's through it and the dev server's on localhost.
const publicOrigin = process.env.DOCS_PUBLIC_ORIGIN
  ? new URL(process.env.DOCS_PUBLIC_ORIGIN)
  : undefined;

// A completion list (`^|`) floats under the end of its sample's last line, and takes no room of
// its own: the sample's block would end above it, and the list would cover the text below. This
// gives the block the list's height as padding. Measured in the browser, a list is 1.7em per item
// plus 0.8em around them, in the code's font size (0.875 of the block's). The 28px is the 8px
// between the line and the list, and the block's usual 20px of padding under the list.
const codeFontRatio = 0.875;
type CompletionNode = { type: string; completions: unknown[] };
const completionRoom = {
  name: 'completion-room',
  pre(node: { properties: { style?: string } }) {
    const meta = (this as unknown as { meta: { twoslash?: { nodes: CompletionNode[] } } }).meta;
    const lists = (meta.twoslash?.nodes ?? []).filter((n) => n.type === 'completion');
    if (lists.length === 0) {
      return;
    }
    const items = Math.max(...lists.map((n) => n.completions.length));
    const em = (0.8 + 1.7 * items) * codeFontRatio;
    node.properties.style = `${node.properties.style ?? ''};padding-bottom:calc(28px + ${em.toFixed(2)}em)`;
  },
};

// A `^?` shows its type in a box on a line of its own under the code, so what follows moves down
// with it. A floating popup covers the lines below it, and no number of blank lines fits every
// width.
//
// The queried name itself stays plain code, in a bare span. The renderer would make it an
// always-open popup with nothing in it, which shows as a second arrow beside the box's own. The
// span keeps the box's arrow under the middle of the name: the renderer reads the name's length
// from an element's text.
type HastNode = { type: string; [key: string]: unknown };
const lineQueries = rendererFloatingVue({ queryRendering: 'line' });
const twoslashRenderer = {
  ...lineQueries,
  nodeQuery: (_query: unknown, node: HastNode) => ({
    type: 'element' as const,
    tagName: 'span',
    properties: {},
    children: [node],
  }),
};

export default defineConfig({
  title: 'nestjs-endpoints',
  description:
    'Write each NestJS endpoint as one file with Zod schemas, and get validation and a typed axios or React Query client.',
  cleanUrls: true,
  lastUpdated: false,
  sitemap: { hostname: site },
  // The samples' app is TypeScript the samples import, not pages.
  srcExclude: ['snippets/**'],

  head: [
    // Cookieless page-view counts (Umami), served from the site's own subdomain. `defer` keeps it
    // off the render path, and a failed report is dropped silently, so the site never waits on
    // it. `data-host-url` is required: without it the tracker posts relative to the script's
    // directory. `data-domains` keeps local dev servers from being counted.
    [
      'script',
      {
        defer: '',
        src: 'https://u.nestjs-endpoints.dev/w/s.js',
        'data-host-url': 'https://u.nestjs-endpoints.dev',
        'data-website-id': 'dac4d8d0-d9cc-4af6-9ff0-09d9df84f5da',
        'data-domains': 'nestjs-endpoints.dev',
      },
    ],
  ],

  // Each page's link preview names the page: its title, its description and its URL.
  transformHead({ pageData, title, description }) {
    const path = pageData.relativePath.replace(/\.md$/, '').replace(/(^|\/)index$/, '$1');
    return [
      ['meta', { property: 'og:type', content: 'website' }],
      ['meta', { property: 'og:site_name', content: 'nestjs-endpoints' }],
      ['meta', { property: 'og:title', content: title }],
      ['meta', { property: 'og:description', content: description }],
      ['meta', { property: 'og:url', content: `${site}/${path}` }],
    ];
  },

  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide/getting-started', activeMatch: '^/guide/' },
      { text: 'Clients', link: '/clients/codegen', activeMatch: '^/clients/' },
      { text: 'Reference', link: '/reference/endpoint', activeMatch: '^/reference/' },
      { text: 'AI agents', link: '/ai/overview', activeMatch: '^/ai/' },
      { text: 'Changelog', link: `${repo}/blob/main/CHANGELOG.md` },
    ],
    sidebar: [
      {
        text: 'Introduction',
        items: [
          { text: 'Getting started', link: '/guide/getting-started' },
          { text: 'Why nestjs-endpoints', link: '/guide/why' },
          { text: 'How it fits NestJS', link: '/guide/nestjs' },
          { text: 'Improvements on NestJS', link: '/guide/improvements' },
          { text: 'Performance', link: '/guide/performance' },
        ],
      },
      {
        text: 'Endpoints',
        items: [
          { text: 'Writing an endpoint', link: '/guide/endpoints' },
          { text: 'Type safety', link: '/guide/type-safety' },
          { text: 'Responses', link: '/guide/responses' },
          { text: 'Dependency injection', link: '/guide/dependency-injection' },
        ],
      },
      {
        text: 'Routing',
        items: [
          { text: 'File-based routing', link: '/guide/file-based-routing' },
          { text: 'Routers', link: '/guide/routers' },
          { text: 'Explicit paths', link: '/guide/explicit-paths' },
        ],
      },
      {
        text: 'Clients',
        items: [
          { text: 'Generating clients', link: '/clients/codegen' },
          { text: 'axios', link: '/clients/axios' },
          { text: 'React Query', link: '/clients/react-query' },
          { text: 'Namespaces', link: '/clients/namespaces' },
          { text: 'OpenAPI', link: '/clients/openapi' },
        ],
      },
      {
        text: 'Workflow',
        items: [
          { text: 'Development', link: '/guide/development' },
          { text: 'Testing', link: '/guide/testing' },
        ],
      },
      {
        text: 'AI agents',
        items: [
          { text: 'Built for agents', link: '/ai/overview' },
          { text: 'Agent playbook', link: '/ai/playbook' },
        ],
      },
      {
        text: 'Reference',
        items: [
          { text: 'Endpoint options', link: '/reference/endpoint' },
          { text: 'Router options', link: '/reference/router' },
          { text: 'Exports', link: '/reference/exports' },
          { text: 'Troubleshooting', link: '/reference/troubleshooting' },
        ],
      },
    ],
    socialLinks: [
      { icon: 'github', link: repo },
      { icon: 'npm', link: 'https://www.npmjs.com/package/nestjs-endpoints' },
    ],
    search: { provider: 'local' },
    outline: [2, 3],
    editLink: { pattern: `${repo}/edit/main/docs/:path`, text: 'Edit this page on GitHub' },
    footer: { message: 'Released under the MIT License.' },
  },

  // llms.txt, llms-full.txt and a Markdown copy of every page, generated from the same files.
  // scripts/package-docs.ts copies them into the npm package, where the agent rules file and
  // skill the package installs point. The index opens by sending a coding agent to the playbook,
  // so whatever points an agent at llms.txt names this one file.
  vite: {
    server: publicOrigin && { allowedHosts: [publicOrigin.hostname] },
    plugins: [
      llmstxt({
        ignoreFiles: ['.vitepress/**', 'snippets/**', 'node_modules/**'],
        customLLMsTxtTemplate: [
          '# {title}',
          '{description}',
          '{details}',
          '{agents}',
          '## Table of Contents',
          '{toc}',
        ].join('\n\n'),
        customTemplateVariables: {
          agents:
            '**Coding agents:** read the [Agent playbook](/ai/playbook.md) first. It has the rules and a recipe for each task, and links to the pages below.',
        },
      }),
    ],
  },

  markdown: {
    codeTransformers: [
      transformerTwoslash({
        twoslashOptions: { vfsRoot: snippets, compilerOptions },
        renderer: twoslashRenderer,
      }),
      completionRoom,
    ],
    // Twoslash's popups are highlighted as these, whatever the page's own samples use.
    languages: ['ts', 'tsx', 'js', 'json', 'bash'],
  },
});
