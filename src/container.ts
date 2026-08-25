import {
  asFunction,
  type AwilixContainer,
  createContainer,
  InjectionMode,
} from 'awilix'
import { createConfigService } from './config-service'
import { createGlobber } from './globber'
import {
  createPackageJSONFileService,
  type IPackageJSONService,
} from './package-json-file-service'
import { createPackageSource } from './package-source'
import { createTypeSyncer } from './type-syncer'
import { createWorkspaceResolverService } from './workspace-resolver'
import * as fsUtils from './fs-utils'

/**
 * Builds the dependency-injection container wiring up all the services the type
 * syncer needs. Shared by the CLI and the library API so both resolve identical
 * services.
 *
 * @param packageJSONServiceFactory Factory for the package.json file service.
 *   Defaults to the read/write filesystem service. The library / `--json` paths
 *   pass a read-only factory to guarantee the working tree is never mutated.
 */
export function createSyncerContainer(
  packageJSONServiceFactory: () => IPackageJSONService = createPackageJSONFileService,
): AwilixContainer {
  return createContainer({
    injectionMode: InjectionMode.CLASSIC,
  }).register({
    packageJSONService: asFunction(packageJSONServiceFactory).singleton(),
    workspaceResolverService: asFunction(() =>
      createWorkspaceResolverService(fsUtils),
    ).singleton(),
    packageSource: asFunction(createPackageSource).singleton(),
    configService: asFunction(createConfigService).singleton(),
    globber: asFunction(createGlobber).singleton(),
    typeSyncer: asFunction(createTypeSyncer),
  })
}
