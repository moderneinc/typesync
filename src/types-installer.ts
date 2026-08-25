import { mkdir, mkdtemp, rename, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import fetch from 'npm-registry-fetch'
import { x as extractTar } from 'tar'
import { loadNpmConfig } from './npm-config'
import type { NpmConfig } from './npm-config'
import type {
  IInstalledTyping,
  ISyncedFile,
  ISyncedTypeDefinition,
} from './types'

/**
 * Installs the missing `@types/*` packages into the `node_modules` of the manifest that is
 * missing them, leaving that manifest and every lock file untouched. Unpacks registry
 * tarballs directly, because `pnpm add` and Yarn Berry's `yarn add` write to
 * `package.json` unconditionally.
 */
export async function installMissingTypes(
  syncedFiles: Array<ISyncedFile>,
  configLoader: () => Promise<NpmConfig> = async () => await loadNpmConfig(),
): Promise<Array<IInstalledTyping>> {
  const pending = syncedFiles.flatMap((file) =>
    file.newTypings.map((typing) => ({
      typing,
      // Typings belong to the manifest that is missing them, which is what makes this
      // correct for workspaces.
      directory: path.join(
        path.dirname(path.resolve(file.filePath)),
        'node_modules',
        typing.typesPackageName,
      ),
    })),
  )
  if (pending.length === 0) {
    return []
  }

  const opts = await configLoader()
  const installed: Array<IInstalledTyping> = []
  for (const { typing, directory } of pending) {
    if (await exists(directory)) {
      continue
    }
    await extract(typing, directory, opts)
    installed.push({
      typesPackageName: typing.typesPackageName,
      version: typing.resolvedVersion,
      directory,
    })
  }
  return installed
}

/**
 * Unpacks beside the target and renames onto it, so a failure part-way cannot leave a
 * half-written package that the next run would skip as already present.
 */
async function extract(
  typing: ISyncedTypeDefinition,
  directory: string,
  opts: NpmConfig,
): Promise<void> {
  const url =
    typing.tarball ??
    `${typing.typesPackageName}/-/${path.basename(typing.typesPackageName)}-${typing.resolvedVersion}.tgz`

  const response = await fetch(url, opts)
  const parent = path.dirname(directory)
  await mkdir(parent, { recursive: true })
  const staging = await mkdtemp(path.join(parent, '.typesync-'))
  try {
    // npm tarballs root every entry at `package/`.
    await pipeline(response.body, extractTar({ cwd: staging, strip: 1 }))
    await rm(directory, { recursive: true, force: true })
    await rename(staging, directory)
  } finally {
    await rm(staging, { recursive: true, force: true })
  }
}

async function exists(directory: string): Promise<boolean> {
  return await stat(directory).then(
    () => true,
    () => false,
  )
}
