import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, dirname, resolve, isAbsolute } from 'node:path'
import { parse as parseIni } from 'ini'

/**
 * Npm config shape consumed by `npm-registry-fetch`.
 *
 * Fields that `npm-registry-fetch` reads include:
 * - `registry`
 * - `<@scope>:registry`
 * - `//<host>/:_authToken`, `//<host>/:_auth`, `//<host>/:username`,
 *   `//<host>/:_password`
 * - `ca`, `cert`, `key`
 * - `strictSSL`
 * - `proxy`, `httpsProxy`, `noProxy`
 * - `userAgent`, `maxSockets`, `timeout`
 *
 * It does *not* read `cafile` (a path) or kebab-case aliases like `strict-ssl`;
 * `normalize()` maps those before the object is handed off.
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

const RENAME: Record<string, string> = {
  'strict-ssl': 'strictSSL',
  'always-auth': 'alwaysAuth',
  'fetch-retries': 'fetchRetries',
  'fetch-retry-factor': 'fetchRetryFactor',
  'fetch-retry-mintimeout': 'fetchRetryMintimeout',
  'fetch-retry-maxtimeout': 'fetchRetryMaxtimeout',
  'https-proxy': 'httpsProxy',
  noproxy: 'noProxy',
  'local-address': 'localAddress',
  'max-sockets': 'maxSockets',
  'user-agent': 'userAgent',
}

const BOOLEAN_OPTS = new Set(['strictSSL', 'alwaysAuth'])

function toBool(v: unknown): unknown {
  if (typeof v === 'boolean') return v
  if (v === 'true') return true
  if (v === 'false') return false
  return v
}

// A cafile may bundle several certs (leaf → intermediate → root). Node's `ca`
// option honors only the first PEM of a single string, so split into one entry
// per certificate as `@npmcli/config` does.
function splitPemBundle(bundle: string): Array<string> {
  const delim = '-----END CERTIFICATE-----'
  return bundle
    .split(delim)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => `${s}\n${delim}\n`)
}

async function normalize(config: NpmConfig, cwd: string): Promise<NpmConfig> {
  const out: NpmConfig = { ...config }

  for (const [from, to] of Object.entries(RENAME)) {
    if (from in out && !(to in out)) {
      out[to] = out[from]
      delete out[from]
    }
  }
  for (const key of BOOLEAN_OPTS) {
    if (key in out) out[key] = toBool(out[key])
  }

  if (typeof out.cafile === 'string' && out.ca === undefined) {
    const path = isAbsolute(out.cafile) ? out.cafile : resolve(cwd, out.cafile)
    try {
      out.ca = splitPemBundle(await readFile(path, 'utf-8'))
      delete out.cafile
    } catch {
      /* missing/unreadable cafile: leave `ca` unset, same as npm */
    }
  }

  return out
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
  return await normalize({ ...userNpmrc, ...projectNpmrc, ...envCfg }, cwd)
}
