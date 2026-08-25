import { createReadStream } from 'node:fs'
import * as fsp from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterAll, describe, it, vi } from 'vitest'
import { c as createTar } from 'tar'
import { computeMissingTypes } from '../library'
import { installMissingTypes } from '../types-installer'

/** Set by the first test that needs it; the mock reads it lazily. */
let tarballPath = ''

vi.mock('npm-registry-fetch', () => {
  const mk = (name: string, version: string, tarball?: string) => ({
    name,
    'dist-tags': { latest: version },
    versions: { [version]: { version, dist: tarball ? { tarball } : {} } },
  })
  const REGISTRY: Record<string, unknown> = {
    lodash: mk('lodash', '4.17.0'),
    '@types/lodash': mk(
      '@types/lodash',
      '4.17.0',
      'https://registry.example/@types/lodash/-/lodash-4.17.0.tgz',
    ),
  }
  return {
    default: async (uri: string) => {
      if (uri.endsWith('.tgz')) {
        return { body: createReadStream(tarballPath) }
      }
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

const createdDirs: Array<string> = []

afterAll(async () => {
  await Promise.all(
    createdDirs.map(async (dir) => {
      await fsp.rm(dir, { recursive: true, force: true })
    }),
  )
})

async function tempDir(): Promise<string> {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'typesync-test-'))
  createdDirs.push(dir)
  return dir
}

/** An npm tarball: every entry rooted at `package/`. */
async function makeTarball(): Promise<string> {
  const dir = await tempDir()
  const pkg = path.join(dir, 'package')
  await fsp.mkdir(pkg, { recursive: true })
  await fsp.writeFile(
    path.join(pkg, 'package.json'),
    JSON.stringify({ name: '@types/lodash', version: '4.17.0' }),
  )
  await fsp.writeFile(
    path.join(pkg, 'index.d.ts'),
    'export declare const x: 1\n',
  )
  const tgz = path.join(dir, 'types-lodash.tgz')
  await createTar({ gzip: true, file: tgz, cwd: dir }, ['package'])
  return tgz
}

async function makeProject(): Promise<{ root: string; rootPath: string }> {
  const root = await tempDir()
  const rootPath = path.join(root, 'package.json')
  await fsp.writeFile(
    rootPath,
    JSON.stringify(
      { name: 'root', version: '1.0.0', dependencies: { lodash: '^4.17.0' } },
      null,
      2,
    ),
  )
  return { root, rootPath }
}

const noNpmrc = async () => ({})

describe('typesync --install', () => {
  it('unpacks the typings into node_modules', async ({ expect }) => {
    tarballPath = await makeTarball()
    const { root, rootPath } = await makeProject()

    const installed = await installMissingTypes(
      (await computeMissingTypes(rootPath)).syncedFiles,
      noNpmrc,
    )

    expect(installed).toEqual([
      {
        typesPackageName: '@types/lodash',
        version: '4.17.0',
        directory: path.join(root, 'node_modules', '@types/lodash'),
      },
    ])
    const dts = path.join(
      root,
      'node_modules',
      '@types',
      'lodash',
      'index.d.ts',
    )
    expect(await fsp.readFile(dts, 'utf8')).toBe('export declare const x: 1\n')
  })

  it('leaves the manifest and lock file byte-identical', async ({ expect }) => {
    tarballPath = await makeTarball()
    const { root, rootPath } = await makeProject()
    const lockPath = path.join(root, 'package-lock.json')
    await fsp.writeFile(lockPath, '{"lockfileVersion": 3}\n')
    const manifestBefore = await fsp.readFile(rootPath, 'utf8')
    const lockBefore = await fsp.readFile(lockPath, 'utf8')

    await installMissingTypes(
      (await computeMissingTypes(rootPath)).syncedFiles,
      noNpmrc,
    )

    expect(await fsp.readFile(rootPath, 'utf8')).toBe(manifestBefore)
    expect(await fsp.readFile(lockPath, 'utf8')).toBe(lockBefore)
  })

  it('skips a typings package that is already present', async ({ expect }) => {
    tarballPath = await makeTarball()
    const { rootPath } = await makeProject()
    const files = (await computeMissingTypes(rootPath)).syncedFiles

    expect(await installMissingTypes(files, noNpmrc)).toHaveLength(1)
    expect(await installMissingTypes(files, noNpmrc)).toHaveLength(0)
  })

  it('installs into the node_modules of the manifest that is missing it', async ({
    expect,
  }) => {
    tarballPath = await makeTarball()
    const { root } = await makeProject()
    const foo = path.join(root, 'packages', 'foo')
    await fsp.mkdir(foo, { recursive: true })
    const fooPath = path.join(foo, 'package.json')
    await fsp.writeFile(
      fooPath,
      JSON.stringify({ name: 'foo', dependencies: { lodash: '^4.17.0' } }),
    )

    await installMissingTypes(
      (await computeMissingTypes(fooPath)).syncedFiles,
      noNpmrc,
    )

    expect(
      await fsp.stat(path.join(foo, 'node_modules', '@types', 'lodash')),
    ).toBeTruthy()
    await expect(
      fsp.stat(path.join(root, 'node_modules', '@types', 'lodash')),
    ).rejects.toThrow()
  })

  it('has nothing to do when no typings are missing', async ({ expect }) => {
    expect(await installMissingTypes([], noNpmrc)).toEqual([])
  })
})
