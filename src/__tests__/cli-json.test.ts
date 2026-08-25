import * as os from 'node:os'
import * as path from 'node:path'
import * as fsp from 'node:fs/promises'
import { afterAll, describe, it, vi } from 'vitest'
import { startCli } from '../cli'

// Every registry lookup fails the way an unreachable or unauthenticated
// Artifactory does — a connection error rather than a 404.
vi.mock('npm-registry-fetch', () => ({
  default: async () => {
    throw Object.assign(
      new Error(
        'request to http://127.0.0.1:1/lodash failed, reason: connect ECONNREFUSED 127.0.0.1:1',
      ),
      { code: 'ECONNREFUSED' },
    )
  },
}))

const createdDirs: Array<string> = []

afterAll(async () => {
  await Promise.all(
    createdDirs.map(async (dir) => {
      await fsp.rm(dir, { recursive: true, force: true })
    }),
  )
})

describe('typesync --json when the registry is unreachable', () => {
  it('writes the reason to stderr, leaves stdout empty, and exits non-zero', async ({
    expect,
  }) => {
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'typesync-json-err-'))
    createdDirs.push(dir)
    const rootPath = path.join(dir, 'package.json')
    await fsp.writeFile(
      rootPath,
      JSON.stringify(
        { name: 'consumer', dependencies: { lodash: '^4.17.0' } },
        null,
        2,
      ) + '\n',
    )

    const originalArgv = process.argv
    const originalExitCode = process.exitCode
    const stdout = vi.spyOn(console, 'log').mockImplementation(() => {})
    const stderr = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true)
    const unhandled: Array<unknown> = []
    const recordUnhandled = (reason: unknown) => unhandled.push(reason)
    process.on('unhandledRejection', recordUnhandled)

    try {
      process.argv = ['node', 'typesync', '--json', rootPath]
      await startCli()
      // Node reports an unhandled rejection a macrotask later, so let the queue
      // drain before concluding there wasn't one.
      await new Promise((resolve) => setTimeout(resolve, 50))

      expect(unhandled).toEqual([])
      expect(stdout).not.toHaveBeenCalled()
      expect(process.exitCode).toBe(1)

      const written = stderr.mock.calls.map((c) => String(c[0])).join('')
      expect(written).toMatch(/ECONNREFUSED/)
      // A bare reason, not a stack dump.
      expect(written.trimEnd()).not.toContain('\n')
    } finally {
      process.off('unhandledRejection', recordUnhandled)
      process.argv = originalArgv
      process.exitCode = originalExitCode
      stdout.mockRestore()
      stderr.mockRestore()
    }
  })
})
