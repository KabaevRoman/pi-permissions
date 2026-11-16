# @pi-ko/permissions

Independently installable pi extension: permissions.

This extension depends on `@pi-ko/core@0.6.0`; it does not require any other extension.

For a release, publish `@pi-ko/core` first, then this package. Install this package through pi's package manager; its npm dependencies provide the shared core automatically. For local development, use the parent npm workspace and build core before running this extension. To distribute before publication, provide both core and extension tarballs.

Feature code and resources live here. Shared runtime, prompt assets, and compatibility profile live in `@pi-ko/core`. Existing compatibility identifiers and saved-state paths remain unchanged.

## Publishing to npm

The `.github/workflows/publish.yml` workflow publishes this package to the public
npm registry when a tag is pushed. It authenticates with the repository secret
`NPM_TOKEN`, an npm automation or granular token that may publish the
`@pi-ko` scope. Enable GitHub Actions in this repository.

Update `package.json` to the release version, commit it, then push a matching tag:

```sh
git tag v0.6.0
git push origin v0.6.0
```

Tags must equal the package version, optionally prefixed with `v`. The workflow
installs dependencies, builds if needed, typechecks, and runs available tests
before publishing. Stable versions use `latest`; prereleases use `next`.
Each version can only be published once.

Publish matching dependency versions in order: `@pi-ko/core`, then
the individual extensions, then `@pi-ko/bundle`. Packages are
published with public access, so dependents install from the public registry
without cross-repository access setup.

## Installing from npm

The committed `.npmrc` routes `@pi-ko` packages to the public npm registry and
leaves other packages on the default registry. The packages are public, so
installing them needs no authentication. Install using the full scoped package
name.

## Permission modes

Run `/permissions` or `/permissions mode` to open the mode picker:

- **Safe** (`safe`): automatically allows workspace reads, read-only agents, and workflow tools. File edits, shell commands, and other operations require approval unless allowed by a policy rule.
- **Ask Everything** (`ask`): asks before every tool call, including reads and calls covered by allow rules. Session approvals are not reused.
- **Full Access** (`fullAccess`): allows operations without approval, including those covered by ask rules. Explicit deny rules still apply.

Select directly with `/permissions mode safe`, `/permissions mode ask`, or
`/permissions mode fullAccess`. The choice is saved with the session. To set a
default for new sessions, set `permissions.defaultMode` in your
`.claude/settings.json` (project settings require project trust).

Use `/permissions status` to inspect the current mode and policy. Existing
`default`, `acceptEdits`, `dontAsk`, and `bypassPermissions` modes remain supported.
Planning restrictions still apply; exit planning through `ExitPlanMode` before
changing permission modes. Full Access does not grant operating-system privileges
or bypass external sandboxes.
