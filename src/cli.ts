import * as path from 'node:path'
import { blue, bold, cyan, gray, green, magenta, white } from 'ansis'
import * as C from './cli-util'
import { createSyncerContainer } from './container'
import { computeMissingTypes, toMissingTypesReport } from './library'
import { installMissingTypes } from './types-installer'
import type {
  ICLIArguments,
  IPackageTypingDescriptor,
  ISyncResult,
  ISyncedFile,
  ITypeSyncer,
} from './types'
import packageJson from '../package.json' with { type: 'json' }

/**
 * Starts the TypeSync CLI.
 */
export async function startCli(): Promise<void> {
  const { args, flags } = C.parseArguments(process.argv.slice(2))
  const [filePath = 'package.json'] = args

  if (flags.help) {
    printHelp()
    return
  }

  // `--json` and `--install` both run the non-mutating analysis. With `--json`, stdout
  // carries the report and nothing else, so a caller can parse it.
  const wantsJson = Boolean(flags.json)
  const wantsInstall = Boolean(flags.install)
  if (wantsJson || wantsInstall) {
    try {
      const result = await computeMissingTypes(filePath, flags)
      const installed = wantsInstall
        ? await installMissingTypes(result.syncedFiles)
        : []
      if (wantsJson) {
        console.log(formatMissingTypesReport(result))
      } else {
        C.log(
          `Installed ${white(String(installed.length))} typings package(s).`,
        )
      }
    } catch (err) {
      // Keep stdout pure JSON; report errors on stderr.
      process.stderr.write(`${(err as Error).message}\n`)
      process.exitCode = 1
    }
    return
  }

  try {
    const container = createSyncerContainer()
    await run(container.resolve<ITypeSyncer>('typeSyncer'), filePath, flags)
  } catch (err) {
    C.error(err as any)
    process.exitCode = 1
  }
}

/**
 * Renders the stable {@link toMissingTypesReport} contract as the string `typesync --json`
 * prints, so the CLI and any caller format it identically.
 */
export function formatMissingTypesReport(result: ISyncResult): string {
  return JSON.stringify(toMissingTypesReport(result), null, 2)
}

/**
 * Actual CLI runner. Uses the `syncer` instance to sync.
 * @param syncer
 * @param filePath Path to the root `package.json`.
 * @param flags Parsed CLI flags.
 */
async function run(
  syncer: ITypeSyncer,
  filePath: string,
  flags: ICLIArguments['flags'],
) {
  C.log(`TypeSync v${white(packageJson.version)}`)
  if (flags.dry) {
    C.log('—— DRY RUN — will not modify file ——')
  }
  const result = await C.spinWhile(
    `Syncing type definitions in ${cyan(filePath)}...`,
    async () => await syncer.sync(filePath, flags),
  )

  const syncedFilesOutput = result.syncedFiles
    .map(renderSyncedFile)
    .join('\n\n')
  const totals = result.syncedFiles.reduce(
    (accum, f) => ({
      newTypings: accum.newTypings + f.newTypings.length,
    }),
    { newTypings: 0 },
  )

  const syncMessage = `\n\n${syncedFilesOutput}\n\n✨  Run ${green`typesync`} again without the ${gray`--dry`} flag to update your ${gray`package.json`}.`
  if (flags.dry === 'fail' && totals.newTypings > 0) {
    C.error('Typings changed; check failed.')
    C.log(syncMessage)
    process.exitCode = 1
    return
  }
  C.success(
    totals.newTypings === 0
      ? `No new typings to add, looks like you're all synced up!`
      : flags.dry
        ? `${totals.newTypings.toString()} new typings can be added.${syncMessage}`
        : `${totals.newTypings.toString()} new typings added.\n\n${syncedFilesOutput}\n\n✨  Go ahead and run ${green`npm install`}, ${green`yarn`}, or ${green`pnpm i`} to install the packages that were added.`,
  )
}

/**
 * Renders a type definition.
 * @param typeDef
 * @param isLast
 */
function renderTypeDef(typeDef: IPackageTypingDescriptor, isLast: boolean) {
  const treeNode = isLast ? '└─' : '├─'
  return `${treeNode} ${green.bold`+`} ${gray`@types/`}${bold.blue(typeDef.typingsName)}`
}

/**
 * Renders a synced file.
 *
 * @param file
 */
function renderSyncedFile(file: ISyncedFile) {
  const badge =
    file.newTypings.length === 0
      ? blue.bold`(no new typings added)`
      : green.bold`(${file.newTypings.length.toString()} new typings added)`

  const dirName = path.basename(path.dirname(path.resolve(file.filePath)))
  const title = `📦 ${file.package.name ?? dirName} ${gray.italic`— ${file.filePath}`} ${badge}`

  const nl = '\n'
  const combined = [...file.newTypings.map((t) => ({ ...t, action: 'add' }))]
  const rendered =
    title +
    nl +
    combined
      .map((t) => renderTypeDef(t, combined[combined.length - 1] === t))
      .join(nl)

  return rendered
}

/**
 * Prints the help text.
 */
function printHelp() {
  console.log(
    `
${blue.bold`typesync`} - adds missing TypeScript definitions to package.json

Options
  ${magenta.bold`--dry`}                                   dry run, won't save the package.json
  ${magenta.bold`--json`}                                  non-mutating; prints the missing typings as JSON to stdout and won't touch any file
  ${magenta.bold`--install`}                               installs the missing typings into node_modules, leaving package.json and lock files alone
  ${magenta.bold`--ignoredeps=<deps|dev|peer|optional>`}   ignores dependencies in the specified sections (comma separate for multiple). Example: ${magenta`ignoredeps=dev,peer`}
  ${magenta.bold`--help`}                                  shows this help menu
  `.trim(),
  )
}
