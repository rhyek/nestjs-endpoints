// `pnpm build`: the app compiled for `pnpm start`, which runs it on Node the way a consumer would.
// The decorator settings Nest's dependency injection needs (`experimentalDecorators`,
// `emitDecoratorMetadata`) are read from tsconfig.json.
import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/**/*.ts'],
  // One module per source file, laid out as in `src/`: file-based routers find their endpoint
  // files by where they sit.
  unbundle: true,
  // `.js` rather than `.mjs`: the package is `"type": "module"`.
  fixedExtension: false,
  // Next to its source, a router leaves out a compiled endpoint whose source file is gone: it
  // finds the source through the map.
  sourcemap: true,
  // Packages are imported at run time, as written, never bundled.
  deps: { neverBundle: true },
});
