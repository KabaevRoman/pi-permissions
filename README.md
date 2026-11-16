# @kabaevroman/pi-code-permissions

Independently installable pi extension: permissions. Former package name: `pi-claude-permissions`.

This extension depends on `@kabaevroman/pi-code-core@0.6.0`; it does not require any other extension.

For a release, publish `@kabaevroman/pi-code-core` first, then this package. Install this package through pi's package manager; its npm dependencies provide the shared core automatically. For local development, use the parent npm workspace and build core before running this extension. To distribute before publication, provide both core and extension tarballs.

Feature code and resources live here. Shared runtime, prompt assets, and compatibility profile live in `@kabaevroman/pi-code-core`. Existing compatibility identifiers and saved-state paths remain unchanged.

## Publishing to GitHub Packages

The `.github/workflows/publish.yml` workflow publishes this package when a tag is
pushed. It uses the automatic `GITHUB_TOKEN` with `packages: write`; no custom
publishing secret is needed. Enable GitHub Actions in this repository.

Update `package.json` to the release version, commit it, then push a matching tag:

```sh
git tag v0.6.0
git push origin v0.6.0
```

Tags must equal the package version, optionally prefixed with `v`. The workflow
installs dependencies, builds if needed, typechecks, and runs available tests
before publishing. Stable versions use `latest`; prereleases use `next`.
Each version can only be published once.

Publish matching dependency versions in order: `@kabaevroman/pi-code-core`, then
the individual extensions, then `@kabaevroman/pi-code-bundle`. After publishing
core, open its GitHub package settings → Manage Actions access and grant **Read**
to every extension repository that depends on it. Before publishing the bundle,
grant its repository **Read** access to each extension package and core as well.
This allows the repositories' `GITHUB_TOKEN` to install dependencies.

New GitHub packages default to private visibility. Change visibility in the
GitHub package settings if public distribution is intended.

## Installing from GitHub Packages

The committed `.npmrc` routes `@kabaevroman` packages to GitHub Packages and leaves
other packages on the default npm registry. Consumers need the same scope mapping
in their project or user `.npmrc`. Authenticate locally with a GitHub personal
access token **(classic)** with `read:packages` and access to the packages:

```sh
npm login --scope=@kabaevroman --auth-type=legacy --registry=https://npm.pkg.github.com
```

Use your GitHub username and the token as the password. Authentication is required
even for public GitHub npm packages. Keep credentials in your user configuration;
never commit tokens. Install using the full scoped package name.

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
