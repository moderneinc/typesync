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

const CERT_A = [
  '-----BEGIN CERTIFICATE-----',
  'AAAAleaf',
  '-----END CERTIFICATE-----',
].join('\n')
const CERT_B = [
  '-----BEGIN CERTIFICATE-----',
  'BBBBroot',
  '-----END CERTIFICATE-----',
].join('\n')

test('cafile bundle is loaded into ca as one entry per certificate', async ({
  expect,
}) => {
  await withScratch(async (scratch) => {
    // given
    await writeFile(join(scratch, 'ca.pem'), `${CERT_A}\n${CERT_B}\n`)
    await writeFile(join(scratch, '.npmrc'), 'cafile=ca.pem\n')

    // when
    const cfg = await loadNpmConfig(scratch, {}, scratch)

    // then
    expect(cfg.cafile).toBeUndefined()
    expect(Array.isArray(cfg.ca)).toBe(true)
    const ca = cfg.ca as Array<string>
    expect(ca).toHaveLength(2)
    expect(ca[0]).toContain('AAAAleaf')
    expect(ca[0].trimEnd().endsWith('-----END CERTIFICATE-----')).toBe(true)
    expect(ca[1]).toContain('BBBBroot')
  })
})

test('directly set ca is left untouched and cafile is not consulted', async ({
  expect,
}) => {
  await withScratch(async (scratch) => {
    // given
    await writeFile(
      join(scratch, '.npmrc'),
      ['ca=inline-cert', 'cafile=does-not-exist.pem', ''].join('\n'),
    )

    // when
    const cfg = await loadNpmConfig(scratch, {}, scratch)

    // then
    expect(cfg.ca).toBe('inline-cert')
  })
})

test('strict-ssl=false from .npmrc maps to strictSSL false', async ({
  expect,
}) => {
  await withScratch(async (scratch) => {
    // given
    await writeFile(join(scratch, '.npmrc'), 'strict-ssl=false\n')

    // when
    const cfg = await loadNpmConfig(scratch, {}, scratch)

    // then
    expect(cfg.strictSSL).toBe(false)
    expect(cfg['strict-ssl']).toBeUndefined()
  })
})

test('npm_config_strict_ssl=false from env maps to strictSSL false', async ({
  expect,
}) => {
  await withScratch(async (scratch) => {
    // given/when
    const cfg = await loadNpmConfig(
      scratch,
      { npm_config_strict_ssl: 'false' },
      scratch,
    )

    // then
    expect(cfg.strictSSL).toBe(false)
    expect(cfg['strict-ssl']).toBeUndefined()
  })
})

test('auth, scoped registry and registry keys pass through verbatim', async ({
  expect,
}) => {
  await withScratch(async (scratch) => {
    // given
    await writeFile(
      join(scratch, '.npmrc'),
      [
        'registry=https://localhost:4873/',
        '//localhost:4873/:_authToken=tok',
        '@acme:registry=https://acme.example/',
        '',
      ].join('\n'),
    )

    // when
    const cfg = await loadNpmConfig(scratch, {}, scratch)

    // then
    expect(cfg.registry).toBe('https://localhost:4873/')
    expect(cfg['//localhost:4873/:_authToken']).toBe('tok')
    expect(cfg['@acme:registry']).toBe('https://acme.example/')
  })
})

test('missing/unreadable cafile does not throw and leaves ca unset', async ({
  expect,
}) => {
  await withScratch(async (scratch) => {
    // given
    await writeFile(join(scratch, '.npmrc'), 'cafile=nope.pem\n')

    // when
    const cfg = await loadNpmConfig(scratch, {}, scratch)

    // then
    expect(cfg.ca).toBeUndefined()
  })
})
