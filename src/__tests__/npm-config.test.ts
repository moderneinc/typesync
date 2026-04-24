import { test } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadNpmConfig } from '../npm-config'

async function withScratch<T>(fn: (scratch: string) => Promise<T>): Promise<T> {
  const scratch = await mkdtemp(join(tmpdir(), 'typesync-npm-config-'))
  try {
    return await fn(scratch)
  } finally {
    await rm(scratch, { recursive: true, force: true })
  }
}

test('reads registry from project .npmrc', async ({ expect }) => {
  await withScratch(async (scratch) => {
    // given
    await writeFile(
      join(scratch, '.npmrc'),
      'registry=https://artifactory.example.com/api/npm/npm/\n',
    )

    // when
    const cfg = await loadNpmConfig(scratch, {}, scratch)

    // then
    expect(cfg.registry).toBe('https://artifactory.example.com/api/npm/npm/')
  })
})

test('env var overrides project .npmrc', async ({ expect }) => {
  await withScratch(async (scratch) => {
    // given
    await writeFile(join(scratch, '.npmrc'), 'registry=https://from-npmrc/\n')

    // when
    const cfg = await loadNpmConfig(
      scratch,
      { NPM_CONFIG_REGISTRY: 'https://from-env/' },
      scratch,
    )

    // then
    expect(cfg.registry).toBe('https://from-env/')
  })
})

test('lowercase npm_config_* env vars are honored', async ({ expect }) => {
  await withScratch(async (scratch) => {
    // given/when
    const cfg = await loadNpmConfig(
      scratch,
      { npm_config_registry: 'https://lowercase/' },
      scratch,
    )

    // then
    expect(cfg.registry).toBe('https://lowercase/')
  })
})

test('picks up scoped registry and auth token from .npmrc', async ({
  expect,
}) => {
  await withScratch(async (scratch) => {
    // given
    await writeFile(
      join(scratch, '.npmrc'),
      [
        '@types:registry=https://artifactory.example.com/api/npm/types/',
        '//artifactory.example.com/api/npm/types/:_authToken=secret',
        '',
      ].join('\n'),
    )

    // when
    const cfg = await loadNpmConfig(scratch, {}, scratch)

    // then
    expect(cfg['@types:registry']).toBe(
      'https://artifactory.example.com/api/npm/types/',
    )
    expect(cfg['//artifactory.example.com/api/npm/types/:_authToken']).toBe(
      'secret',
    )
  })
})

test('walks up to find .npmrc in a parent dir', async ({ expect }) => {
  await withScratch(async (scratch) => {
    // given
    const nested = join(scratch, 'deep', 'nested')
    await mkdir(nested, { recursive: true })
    await writeFile(join(scratch, '.npmrc'), 'registry=https://parent/\n')

    // when
    const cfg = await loadNpmConfig(nested, {}, scratch)

    // then
    expect(cfg.registry).toBe('https://parent/')
  })
})

test('project .npmrc overrides user .npmrc', async ({ expect }) => {
  await withScratch(async (scratch) => {
    // given
    const userHome = join(scratch, 'home')
    const project = join(scratch, 'proj')
    await mkdir(userHome, { recursive: true })
    await mkdir(project, { recursive: true })
    await writeFile(join(userHome, '.npmrc'), 'registry=https://user/\n')
    await writeFile(join(project, '.npmrc'), 'registry=https://project/\n')

    // when
    const cfg = await loadNpmConfig(project, {}, userHome)

    // then
    expect(cfg.registry).toBe('https://project/')
  })
})
