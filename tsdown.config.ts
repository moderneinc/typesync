import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['./src/{index,cli}.ts'],
  format: 'esm',
  target: 'node18',
  platform: 'node',
  clean: true,
  sourcemap: true,
  // `platform: 'node'` would otherwise pin the output to `.mjs`. The package is
  // `"type": "module"`, so plain `.js` is already ESM, and it is what `exports`
  // and `bin/typesync.mjs` resolve.
  fixedExtension: false,
  deps: { neverBundle: true },
  dts: { sourceMap: true },
  publint: { strict: true },
  unused: { level: 'error' },
})
