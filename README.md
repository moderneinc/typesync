# @openrewrite/typesync

A fork of [jeffijoe/typesync](https://github.com/jeffijoe/typesync), published to npm as [`@openrewrite/typesync`](https://www.npmjs.com/package/@openrewrite/typesync).

For usage and documentation, see the upstream project.

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
