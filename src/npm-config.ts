import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { parse as parseIni } from 'ini'

/**
 * Npm config shape consumed by `npm-registry-fetch`.
 *
 * Fields that `npm-registry-fetch` reads include:
 * - `registry`
 * - `<@scope>:registry`
 * - `//<host>/:_authToken`, `//<host>/:_auth`, `//<host>/:username`,
 *   `//<host>/:_password`
 * - `cafile`, `ca`, `cert`, `key`
 * - `strictSSL`
 * - `proxy`, `httpsProxy`, `noproxy`
 * - `userAgent`, `maxSockets`, `timeout`
 */
export type NpmConfig = Record<string, unknown>

async function readIniIfExists(path: string): Promise<NpmConfig> {
  try {
    const content = await readFile(path, 'utf-8')
    return parseIni(content) as NpmConfig
  } catch {
    return {}
  }
}

function readEnvConfig(env: NodeJS.ProcessEnv): NpmConfig {
  const out: NpmConfig = {}
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) continue
    if (!/^npm_config_/i.test(key)) continue
    const name = key
      .slice('npm_config_'.length)
      .replace(/_/g, '-')
      .toLowerCase()
    out[name] = value === 'true' ? true : value === 'false' ? false : value
  }
  return out
}

async function findProjectNpmrc(from: string): Promise<string | null> {
  let dir = resolve(from)
  while (true) {
    const candidate = join(dir, '.npmrc')
    try {
      await readFile(candidate)
      return candidate
    } catch {
      /* not here, walk up */
    }
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

/**
 * Loads npm configuration from `.npmrc` files and `npm_config_*` env vars,
 * merged in npm's precedence order (env > project > user). The resulting
 * object is suitable to pass as opts to `npm-registry-fetch`.
 *
 * `cwd` and `env` are injectable so the loader can be tested without
 * mutating globals.
 */
export async function loadNpmConfig(
  cwd: string = process.cwd(),
  env: NodeJS.ProcessEnv = process.env,
  userHome: string = homedir(),
): Promise<NpmConfig> {
  const userNpmrc = await readIniIfExists(join(userHome, '.npmrc'))
  const projectNpmrcPath = await findProjectNpmrc(cwd)
  const projectNpmrc = projectNpmrcPath
    ? await readIniIfExists(projectNpmrcPath)
    : {}
  const envCfg = readEnvConfig(env)
  return { ...userNpmrc, ...projectNpmrc, ...envCfg }
}
