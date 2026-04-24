import fetch from 'npm-registry-fetch'
import { compare } from 'semver'
import type { IPackageVersionInfo } from './versioning'
import { loadNpmConfig } from './npm-config'
import type { NpmConfig } from './npm-config'

/**
 * Fetches info about a package.
 */
export interface IPackageSource {
  /**
   * Fetches package info from an external source.
   *
   * @param packageName
   */
  fetch(this: void, packageName: string): Promise<IPackageInfo | null>
}

/**
 * Interface for the Package Info structure.
 */
export interface IPackageInfo {
  name: string
  latestVersion: string
  deprecated: boolean
  versions: Array<IPackageVersionInfo>
}

/**
 * Creates a package source.
 *
 * By default, `npm-registry-fetch` opts are loaded from `.npmrc` files and
 * `npm_config_*` env vars via `loadNpmConfig()`, so the configured registry,
 * auth tokens, CA bundles, proxies and scoped registries are honored. Pass a
 * custom `configLoader` (e.g. from tests) to override.
 */
export function createPackageSource(
  configLoader: () => Promise<NpmConfig> = async () => await loadNpmConfig(),
): IPackageSource {
  let cachedOpts: NpmConfig | undefined
  const getOpts = async (): Promise<NpmConfig> => {
    if (cachedOpts) return cachedOpts
    cachedOpts = await configLoader()
    return cachedOpts
  }

  return {
    /**
     * Fetches info about a package, or `null` if not found.
     */
    fetch: async (name) => {
      const opts = await getOpts()
      const response = await fetch(encodeURI(name), opts).catch((err) => {
        if (err.statusCode === 404) {
          return null
          /* v8 ignore next */
        }

        /* v8 ignore next */
        throw err
      })

      const data = await response?.json()

      if (!data?.versions) {
        return null
      }

      const versionIdentifiers = Object.keys(data.versions)
        .sort(compare)
        .reverse()
      const versions = versionIdentifiers.map<IPackageVersionInfo>((v) => {
        const item = data.versions[v]
        return {
          version: item.version,
          containsInternalTypings: !!item.types || !!item.typings,
        }
      })

      return {
        name: data.name,
        deprecated: Boolean(data.versions[versionIdentifiers[0]].deprecated),
        latestVersion: data['dist-tags'].latest,
        // Sort by version, highest version first.
        versions: versions,
      }
    },
  }
}
