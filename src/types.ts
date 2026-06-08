import type { IWorkspacesArray, IWorkspacesSection } from './workspace-resolver'

/**
 * The guts of the program.
 */
export interface ITypeSyncer {
  sync(
    this: void,
    filePath: string,
    flags: ICLIArguments['flags'],
  ): Promise<ISyncResult>
}

/**
 * Sync options.
 */
export interface ISyncOptions {
  /**
   * Ignore certain deps.
   */
  ignoreDeps?: Array<IDependencySection>

  /**
   * Ignore certain packages.
   */
  ignorePackages?: Array<string>

  /**
   * Skip resolution of certain projects in the workspace.
   */
  ignoreProjects?: IWorkspacesArray
}

/**
 * Package.json file.
 */
export interface IPackageFile {
  name?: string
  dependencies?: IDependenciesSection
  devDependencies?: IDependenciesSection
  peerDependencies?: IDependenciesSection
  optionalDependencies?: IDependenciesSection
  workspaces?: IWorkspacesSection
  [key: string]: unknown
}

/**
 * Section in package.json representing dependencies.
 */
export type IDependenciesSection = Record<string, string>

/**
 * Package + version record, collected from the {"package": "^1.2.3"} sections.
 */
export interface IPackageVersion {
  name: string
  version: string
}

/**
 * Describes how a package may be typed.
 */
export interface IPackageTypingDescriptor {
  typingsName: string
  codePackageName: string
  typesPackageName: string
}

/**
 * A type definition with the corresponding code package name.
 */
export interface ISyncedTypeDefinition extends IPackageTypingDescriptor {
  codePackageName: string
  /**
   * The resolved version range specifier to install for this typings package,
   * e.g. `~1.2.3`. This is exactly what would be written to `devDependencies`,
   * so a caller can install it additively without typesync editing any file.
   */
  version: string
}

/**
 * Sync result.
 */
export interface ISyncResult {
  /**
   * The files that were synced.
   */
  syncedFiles: Array<ISyncedFile>
}

/**
 * A file that was synced.
 */
export interface ISyncedFile {
  /**
   * The cwd-relative path to the synced file.
   */
  filePath: string
  /**
   * The package file that was synced.
   */
  package: IPackageFile
  /**
   * The new typings that were added.
   */
  newTypings: Array<ISyncedTypeDefinition>
}

/**
 * Dependency sections.
 */
export enum IDependencySection {
  dev = 'dev',
  deps = 'deps',
  optional = 'optional',
  peer = 'peer',
}

/**
 * Stable, machine-readable report of the missing typings computed by the
 * non-mutating analysis. This is the documented contract emitted by
 * `typesync --json` and produced by {@link ISyncResult} via `toMissingTypesReport`.
 *
 * It is intentionally a narrow projection of {@link ISyncResult} so that the
 * internal sync result can evolve without breaking external consumers.
 */
export interface IMissingTypesReport {
  /**
   * One entry per analyzed `package.json` (the root plus any workspace
   * manifests), each listing the `@types/*` packages it is missing.
   */
  syncedFiles: Array<IMissingTypesFile>
}

/**
 * The missing typings for a single `package.json`.
 */
export interface IMissingTypesFile {
  /**
   * Path to the owning `package.json`, as passed in / resolved by typesync.
   */
  filePath: string
  /**
   * The `name` field of the owning `package.json`, if any.
   */
  package?: string
  /**
   * The `@types/*` packages that are missing for this manifest.
   */
  newTypings: Array<IMissingTyping>
}

/**
 * A single missing typings package, with everything a caller needs to install
 * it (e.g. `npm install --no-save --no-package-lock <typesPackageName>@<version>`).
 */
export interface IMissingTyping {
  /**
   * The typings package to install, e.g. `@types/lodash`.
   */
  typesPackageName: string
  /**
   * The code package the typings are for, e.g. `lodash`.
   */
  codePackageName: string
  /**
   * The resolved version range specifier, e.g. `~1.2.3`.
   */
  version: string
}

/**
 * CLI arguments.
 */
export interface ICLIArguments {
  flags: Record<string, boolean | string | undefined>
  args: Array<string>
}
