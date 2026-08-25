import * as path from 'node:path'
import { blue, bold, cyan, gray, green, magenta, white } from 'ansis'
import * as C from './cli-util'
import { createSyncerContainer } from './container'
import { computeMissingTypes, toMissingTypesReport } from './library'
import type {
  ICLIArguments,
  IPackageTypingDescriptor,
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

  // `--json`: non-mutating machine-readable mode. Emit only JSON on stdout so a
  // caller (e.g. the Moderne CLI) can parse it and install the packages itself.
  if (flags.json) {
    try {
      console.log(await computeJsonReport(filePath, flags))
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
 * Computes the missing typings without modifying any file and returns the
 * stable {@link toMissingTypesReport} JSON contract as a string. This is what
 * `typesync --json` prints.
 *
 * @param filePath Path to the root `package.json`.
 * @param flags CLI flags (e.g. `ignoredeps`). The compute path is always dry.
 */
export async function computeJsonReport(
  filePath = 'package.json',
  flags: ICLIArguments['flags'] = {},
): Promise<string> {
  const result = await computeMissingTypes(filePath, flags)
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
  ${magenta.bold`--ignoredeps=<deps|dev|peer|optional>`}   ignores dependencies in the specified sections (comma separate for multiple). Example: ${magenta`ignoredeps=dev,peer`}
  ${magenta.bold`--help`}                                  shows this help menu
  `.trim(),
  )
}
