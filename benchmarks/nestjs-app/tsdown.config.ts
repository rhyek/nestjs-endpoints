// `pnpm build`: the app compiled for `pnpm start`, which runs it on Node the way a consumer would.
// The decorator settings Nest's dependency injection needs (`experimentalDecorators`,
// `emitDecoratorMetadata`) are read from tsconfig.json. It is built exactly as
// ../nestjs-endpoints-app is, so that the two apps differ only in how they wire Nest.
import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/**/*.ts'],
  // One module per source file, laid out as in `src/`.
  unbundle: true,
  // `.js` rather than `.mjs`: the package is `"type": "module"`.
  fixedExtension: false,
  sourcemap: true,
  // Packages are imported at run time, as written, never bundled.
  deps: { neverBundle: true },
});
