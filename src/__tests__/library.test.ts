import * as os from 'node:os'
import * as path from 'node:path'
import * as fsp from 'node:fs/promises'
import { afterAll, describe, it, vi } from 'vitest'
import { computeMissingTypes, toMissingTypesReport } from '../library'
import { computeJsonReport } from '../cli'
import type { IMissingTypesReport } from '../types'

// Mock the registry so the test is hermetic (no network). The package source
// calls `fetch(encodeURI(name), opts)` and reads `.json()` off the response.
vi.mock('npm-registry-fetch', () => {
  const mk = (name: string, version: string) => ({
    name,
    'dist-tags': { latest: version },
    versions: { [version]: { version } },
  })
  const REGISTRY: Record<string, unknown> = {
    lodash: mk('lodash', '4.17.0'),
    '@types/lodash': mk('@types/lodash', '4.17.0'),
    'left-pad': mk('left-pad', '1.3.0'),
    '@types/left-pad': mk('@types/left-pad', '1.3.0'),
  }
  return {
    default: async (uri: string) => {
      const data = REGISTRY[decodeURI(uri)]
      if (!data) {
        const err = new Error('not found') as Error & { statusCode: number }
        err.statusCode = 404
        throw err
      }
      return { json: async () => data }
    },
  }
})

// Track every temp dir we create and clean them all up at the very end. Cleaning
// per-test (e.g. in afterEach) would race with shared mutable state across tests,
// so each test owns its own directory captured in a local.
const createdDirs: Array<string> = []

afterAll(async () => {
  await Promise.all(
    createdDirs.map(async (dir) => {
      await fsp.rm(dir, { recursive: true, force: true })
    }),
  )
})

/**
 * Creates a temp project with a root manifest depending on `lodash` and a
 * `packages/foo` workspace depending on `left-pad`, neither of which ships types.
 */
async function makeProject(): Promise<{
  rootPath: string
  fooPath: string
}> {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'typesync-lib-'))
  createdDirs.push(dir)
  const rootPath = path.join(dir, 'package.json')
  const fooPath = path.join(dir, 'packages', 'foo', 'package.json')

  await fsp.writeFile(
    rootPath,
    JSON.stringify(
      {
        name: 'consumer',
        dependencies: { lodash: '^4.17.0' },
        workspaces: ['packages/*'],
      },
      null,
      2,
    ) + '\n',
  )
  await fsp.mkdir(path.dirname(fooPath), { recursive: true })
  await fsp.writeFile(
    fooPath,
    JSON.stringify(
      { name: 'foo', dependencies: { 'left-pad': '^1.0.0' } },
      null,
      2,
    ) + '\n',
  )

  return { rootPath, fooPath }
}

describe('computeMissingTypes', () => {
  it('reports missing @types per manifest without modifying any file', async ({
    expect,
  }) => {
    const { rootPath, fooPath } = await makeProject()
    const rootBefore = await fsp.readFile(rootPath, 'utf8')
    const fooBefore = await fsp.readFile(fooPath, 'utf8')

    const result = await computeMissingTypes(rootPath)

    // The working tree is untouched, byte for byte.
    expect(await fsp.readFile(rootPath, 'utf8')).toBe(rootBefore)
    expect(await fsp.readFile(fooPath, 'utf8')).toBe(fooBefore)

    const report = toMissingTypesReport(result)
    expect(report.syncedFiles).toHaveLength(2)

    const root = report.syncedFiles.find((f) => f.filePath === rootPath)!
    expect(root.package).toBe('consumer')
    expect(root.newTypings).toEqual([
      {
        typesPackageName: '@types/lodash',
        codePackageName: 'lodash',
        version: '~4.17.0',
      },
    ])

    const foo = report.syncedFiles.find((f) => f.filePath === fooPath)!
    expect(foo.package).toBe('foo')
    expect(foo.newTypings).toEqual([
      {
        typesPackageName: '@types/left-pad',
        codePackageName: 'left-pad',
        version: '~1.3.0',
      },
    ])
  })

  it('emits the same report as parseable JSON for the CLI (--json)', async ({
    expect,
  }) => {
    const { rootPath } = await makeProject()
    const rootBefore = await fsp.readFile(rootPath, 'utf8')

    const json = await computeJsonReport(rootPath)

    // Output is valid JSON matching the documented report contract...
    const parsed = JSON.parse(json) as IMissingTypesReport
    const expected = toMissingTypesReport(await computeMissingTypes(rootPath))
    expect(parsed).toEqual(expected)

    // ...and producing it never touched the working tree.
    expect(await fsp.readFile(rootPath, 'utf8')).toBe(rootBefore)
  })
})
