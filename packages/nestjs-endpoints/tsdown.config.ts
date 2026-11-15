import { defineConfig } from 'tsdown';

// The package's build (`scripts/build.sh`): one `dist/*.js` per source file, as `tsc` lays it
// out, with the sources' extensionless relative imports written out as `./x.js`. Nothing is
// bundled, so `dist/` keeps the layout the package reads itself from (`../package.json`,
// `../assets/skill.md`).
export default defineConfig({
  entry: ['src/**/*.ts', '!src/**/*.spec.ts'],
  root: 'src',
  unbundle: true,
  platform: 'node',
  fixedExtension: false,
  tsconfig: 'tsconfig.build.json',
  sourcemap: true,
  // Maps name `../src/*.ts`, which the package ships, and carry no copy of it, as `tsc`'s did.
  outputOptions: { sourcemapExcludeSources: true },
  // Type-checks while it writes the declarations (and their maps), so a type error fails the build.
  dts: { typecheck: true },
  treeshake: false,
  minify: false,
});
