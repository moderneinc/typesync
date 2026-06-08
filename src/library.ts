import { createSyncerContainer } from './container'
import { createReadOnlyPackageJSONService } from './package-json-file-service'
import type {
  ICLIArguments,
  IMissingTypesReport,
  ISyncResult,
  ITypeSyncer,
} from './types'

/**
 * Computes the set of missing `@types/*` packages for a project **without
 * modifying any `package.json` on disk**.
 *
 * This runs the exact same detection as the CLI, but in a non-mutating mode: it
 * resolves the root manifest plus any workspace manifests, determines which
 * `@types/*` packages are missing (and at which version range), and returns the
 * result. Nothing is written to the working tree — a caller can install the
 * reported packages itself, e.g. additively via
 * `npm install --no-save --no-package-lock @types/foo@~1.2.3`.
 *
 * The returned {@link ISyncResult.syncedFiles} groups the missing typings by the
 * owning `package.json`, so npm/yarn/pnpm workspaces are handled. For a stable,
 * machine-readable projection (e.g. for crossing a process boundary), pass the
 * result to {@link toMissingTypesReport}.
 *
 * @param filePath Path to the root `package.json`. Defaults to `package.json`
 *   relative to the current working directory.
 * @param flags Optional CLI-style flags, mirroring {@link ITypeSyncer.sync}
 *   (e.g. `{ ignoredeps: 'dev' }`). The `dry` flag is forced on regardless, so
 *   this call can never write.
 */
export async function computeMissingTypes(
  filePath = 'package.json',
  flags: ICLIArguments['flags'] = {},
): Promise<ISyncResult> {
  // Read-only file service + forced dry run: belt and suspenders so the working
  // tree cannot be mutated through this entry point.
  const container = createSyncerContainer(createReadOnlyPackageJSONService)
  const syncer = container.resolve<ITypeSyncer>('typeSyncer')
  return await syncer.sync(filePath, { ...flags, dry: true })
}

/**
 * Projects an {@link ISyncResult} into the stable, documented
 * {@link IMissingTypesReport} contract emitted by `typesync --json`.
 *
 * Keeping this projection separate lets the internal sync result evolve without
 * breaking external (e.g. cross-process) consumers of the JSON output.
 */
export function toMissingTypesReport(result: ISyncResult): IMissingTypesReport {
  return {
    syncedFiles: result.syncedFiles.map((file) => ({
      filePath: file.filePath,
      package: file.package.name,
      newTypings: file.newTypings.map((t) => ({
        typesPackageName: t.typesPackageName,
        codePackageName: t.codePackageName,
        version: t.version,
      })),
    })),
  }
}
