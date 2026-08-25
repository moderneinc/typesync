import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      enabled: true,
      provider: 'v8',
      // `exclude` defaults to empty, so every path to leave out of the report —
      // the test files and the CLI/entry modules — must be listed explicitly.
      include: ['src/**'],
      exclude: [
        'src/__tests__/**',
        'src/cli-util.ts',
        'src/index.ts',
        'src/cli.ts',
      ],
    },
    sequence: {
      concurrent: true,
      shuffle: {
        files: false,
        tests: true,
      },
    },
    expect: {
      requireAssertions: true,
    },
    mockReset: true,
  },
})
