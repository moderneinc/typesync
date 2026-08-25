# @openrewrite/typesync

A fork of [jeffijoe/typesync](https://github.com/jeffijoe/typesync), published to npm as [`@openrewrite/typesync`](https://www.npmjs.com/package/@openrewrite/typesync).

For general usage and documentation, see the upstream project.

## Computing missing `@types` without mutating `package.json`

By default the CLI **writes** the missing `@types/*` packages into your
`package.json` (and workspace manifests), exactly like upstream. This fork also
exposes the underlying analysis as a **non-mutating** operation: it computes
which `@types/*` packages are missing — and at which version range — and reports
them **without touching any file on disk**. The caller can then install them
however it likes, e.g. additively without dirtying the working tree:

```sh
npm install --no-save --no-package-lock @types/lodash@~4.17.24
```

There are two ways to consume the non-mutating analysis. Both run the same
detection as the default path and group the result by the owning `package.json`,
so npm/yarn/pnpm workspaces are handled.

> **Run typesync with the working directory set to the project.** This fork
> resolves the registry, auth tokens and proxy settings from `.npmrc` by walking
> up from `process.cwd()`, not from the directory of the `package.json` passed
> in. Called from elsewhere, it misses a private (e.g. Artifactory) registry and
> silently resolves versions against the public one instead.

### As a library

```ts
import { computeMissingTypes, toMissingTypesReport } from '@openrewrite/typesync'

// Defaults to `package.json` in the cwd. Accepts the same CLI-style flags as the
// CLI (e.g. `{ ignoredeps: 'dev' }`). Never writes to disk.
const result = await computeMissingTypes('package.json')

for (const file of result.syncedFiles) {
  for (const typing of file.newTypings) {
    // typing.typesPackageName -> '@types/lodash'
    // typing.codePackageName  -> 'lodash'
    // typing.version          -> '~4.17.24'  (the resolved range specifier)
    console.log(file.filePath, typing.typesPackageName, typing.version)
  }
}

// `toMissingTypesReport(result)` projects the (internal) sync result into the
// same stable, documented JSON shape that `--json` emits (see below).
const report = toMissingTypesReport(result)
```

`computeMissingTypes` returns the full `ISyncResult` (`syncedFiles`), which
carries the parsed `package.json` for each manifest in addition to the missing
typings.

### Via the CLI (`--json`)

For non-Node callers, run the CLI with `--json`. It is non-mutating, prints the
report as JSON to **stdout** (all human-readable chrome is suppressed), and exits
non-zero with the error on **stderr** if analysis fails:

```sh
typesync --json [path/to/package.json]
```

The output is a stable, documented contract (`IMissingTypesReport`):

```jsonc
{
  "syncedFiles": [
    {
      "filePath": "package.json",        // owning package.json
      "package": "my-app",               // its "name", if any
      "newTypings": [                      // ordered by typesPackageName
        {
          "typesPackageName": "@types/lodash", // package to install
          "codePackageName": "lodash",         // package it provides types for
          "version": "~4.17.24"                // resolved version range specifier
        }
      ]
    }
    // ...one entry per workspace package.json
  ]
}
```

> The existing default (write to `package.json`) and `--dry` (human-readable
> preview) behaviors are unchanged; `--json` is an additional, machine-readable,
> non-mutating mode.

## Releasing

Releases are published to npm **locally**, not from CI. You need:

- npm account that is a member of the `@openrewrite` org with publish rights
- `npm login` completed in your shell (run `npm whoami` to verify)
- A clean working tree on `master`, up to date with `origin/master`

### Versioning

Use **fork-style versions** of the form `X.Y.Z-moderne.N`, where `X.Y.Z` tracks the upstream `jeffijoe/typesync` release this fork is based on, and `N` is incremented for each release of the Moderne fork on top of that upstream version. Example progression:

```
0.14.3-moderne.0   <- initial fork of upstream 0.14.3
0.14.3-moderne.1   <- next Moderne release, still on upstream 0.14.3
0.14.3-moderne.2
...
0.15.0-moderne.0   <- after rebasing onto upstream 0.15.0
```

This keeps it unambiguous which upstream version is shipped and which Moderne iteration is on top, and avoids ever colliding with an upstream `X.Y.Z` tag.

Run from the repo root:

```sh
npm run release:prerelease   # 0.14.3-moderne.0 -> 0.14.3-moderne.1  (preferred default)
```

Use `release:patch` / `release:minor` only when rebasing onto a new upstream version — bump the base version manually first (e.g. edit `package.json` to `0.15.0-moderne.0`), or run `npm version <new>` directly, rather than relying on `release:patch`/`release:minor` (which strip the `-moderne.N` suffix).

Each script will:

1. Run `npm version <type>` — bumps `package.json` / `package-lock.json`, commits, and creates an annotated `vX.Y.Z-moderne.N` git tag.
2. Run `npm run do:publish` — lints, tests, builds, then `npm publish` (uses `publishConfig.access: public` from `package.json`).
3. Run `git push --follow-tags` — pushes the commit and the new tag to `origin`.

### Verify

- `npmjs.com/package/@openrewrite/typesync` shows the new version
- Smoke test: `npx @openrewrite/typesync@<version> --dry`

### Recovery

- **Bad version published**: do NOT `npm unpublish` (breaks consumers). Run `npm deprecate '@openrewrite/typesync@<version>' "<reason>"` and release a new version.
- **Publish failed after `npm version` already committed/tagged**: fix the cause, then re-run `npm run do:publish` manually; push tags with `git push --follow-tags`.
