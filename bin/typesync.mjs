#!/usr/bin/env node

// When stdout is not an interactive terminal (e.g. TypeSync is invoked by a
// tool that captures its output into a log file), suppress ANSI color codes so
// the captured output stays readable. NO_COLOR must be set before the CLI — and
// therefore `ansis` — is imported, since ansis resolves color support at import
// time; the dynamic import below guarantees that ordering. An explicit NO_COLOR
// or FORCE_COLOR from the caller is always respected.
if (!process.stdout.isTTY && !process.env.NO_COLOR && !process.env.FORCE_COLOR) {
  process.env.NO_COLOR = '1'
}

const { startCli } = await import('../dist/cli.js')

await startCli()
