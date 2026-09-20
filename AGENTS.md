# Agent Rules

## Package Manager

Use `vp` (Vite+) for all package management commands: `vp install`, `vp add`, `vp run <script>`, `vp exec <bin>`. It delegates to the pnpm version pinned in `packageManager`, so never call `pnpm`, `npm`, or `yarn` directly.

The root scripts (`build`, `test`, `lint`, `type-check`, and so on) wrap turbo. Run them with `vp run <script>`, never with the `vp dev` / `vp build` / `vp test` / `vp lint` / `vp fmt` built-ins, which run Vite's own tooling and bypass turbo and Prettier.

Exception: End-user install instructions should use `npm install -g` (global) or `npm install -D` (project dev dependency) since npm is universal.

## Dependencies

Always check for the latest npm version when adding dependencies. Use `vp add <package>` (without version) to get the latest, or verify with `vp info <package> version` first.

## No Emojis

Do not use emojis anywhere in this repository (code, comments, output, docs).

## Dashes

Never use `--` as a dash in prose, comments, or user-facing output. Use an em dash (\u2014) when a dash is needed, but prefer rephrasing to avoid dashes entirely. The only exception is CLI flags (e.g. `--port`).

## Boolean Environment Variables

Document boolean env vars using only `0` and `1` in CLI help, SKILL.md, docs pages, and README. Code accepts `true`/`false` as well (and `skip` for `LABELHOST`), but these alternatives are not documented.

## Docs Updates

When a change affects how humans or agents use labelhost (new/changed/removed commands, flags, behavior, or config), update all of these:

1. `README.md` (user-facing documentation)
2. `skills/labelhost/SKILL.md` (agent skill for using labelhost)
3. `packages/labelhost/src/cli.ts` (`--help` output)

## Releasing

Releases are manual, single-PR affairs. The maintainer controls the changelog voice and format.

Versions are this fork's own and do not track upstream portless. Numbering restarted at 1.0.0.

To prepare a release:

1. Create a branch (e.g. `prepare-v1.2.0`)
2. Bump the version in `packages/labelhost/package.json`
3. Write the changelog entry in `CHANGELOG.md`, wrapped in `<!-- release:start -->` and `<!-- release:end -->` markers
4. Remove the `<!-- release:start -->` and `<!-- release:end -->` markers from the previous release entry (only the latest release should have markers)
5. Add a matching entry to `apps/docs/src/app/changelog/page.mdx`
6. Open a PR and merge to `main`, which stages the package
7. Approve the staged package with 2FA, which is what publishes it
8. Run the Release workflow from the Actions tab to create the GitHub release

Merging the release PR does not publish. `.github/workflows/release.yml` stages the package, and a maintainer approves it with 2FA. The release body is extracted from the content between the markers.

### Publish routes

There are two routes to npm.

**Workflow route (default), in two steps.** Merging the release PR to main runs `.github/workflows/release.yml`, which runs `npm stage publish --provenance`. Staging uploads the package but leaves it non-public, and never prompts for 2FA, which is what lets it run unattended. The version is not installable yet. A maintainer then approves it, from the Staged Packages tab on npmjs.com or with `npm stage list` and `npm stage approve <stage-id>`, and npm prompts for 2FA either way. Once npm serves the version, run the Release workflow again from the Actions tab to create the GitHub release.

The workflow authenticates with the `NPM_TOKEN` secret when that secret is set on the `Release` environment, and otherwise falls back to npm trusted publishing over OIDC. Configure one of the two, or the stage step has no credentials. The trust relationship needs `--allow-stage-publish`; `--allow-publish` is not required and npm recommends leaving it off.

Approval cannot be automated, by design. A trust relationship's shortlived token may run `npm stage publish` and `npm publish` but no other `npm stage` subcommand, so CI cannot list or approve staged packages even with a token.

**Manual route.** `vp run release:manual` runs `scripts/publish.sh`, which publishes directly from a local machine, skipping staging. It runs under your own session token, so the trust relationship's permissions do not apply and npm prompts for 2FA itself. Use it when the workflow route cannot run, most notably for the first publish of a new package name: neither trusted publishing nor staging can bootstrap one, since both require the package to already exist. The script refuses a dirty tree, a version already on npm, and a changelog with no release markers, then runs the same checks CI would.

The two routes do not conflict. `check-release` stages nothing when the local version already matches npm, so a manual publish followed by a merge to main still creates the GitHub release. A manually published version carries no provenance, because npm only attests builds that ran in a supported CI environment, so prefer the workflow route once it authenticates.

### What the workflow decides

`check-release` stages only on the commit that bumps the version, or on a manual dispatch. A staged version is not public, so npm never reports it and the job cannot ask, and staging the same version twice is an error; without that rule every unrelated push to main would retry the stage while an approval is pending. A dispatch forces a retry when a stage fails.

The GitHub release is held back until npm actually serves the version, so it never announces something nobody can install. That is why creating it takes a second run after approval.

## Windows Debugging

A remote Windows Server 2022 EC2 instance is available for debugging Windows-specific issues. It uses AWS Systems Manager (SSM) with no SSH or open ports. Commands run via `aws ssm send-command` and return stdout/stderr.

All scripts require `AWS_PROFILE=labelhost-debug` (or the profile must be set as default). Prefix every command with it or export it for the session:

```bash
export AWS_PROFILE=labelhost-debug
```

### Prerequisites

The instance must be provisioned first (one-time, by a human):

```bash
./scripts/windows-debug/provision.sh
```

Requires: AWS CLI v2 configured with `ec2:*`, `iam:CreateRole`, `iam:AttachRolePolicy`, `ssm:SendCommand`, `ssm:GetCommandInvocation` permissions and a default VPC.

### Usage

Start the instance (if stopped):

```bash
./scripts/windows-debug/start.sh
```

Run a command on Windows:

```bash
./scripts/windows-debug/run.sh "<powershell-command>"
```

Sync the current git branch and rebuild:

```bash
./scripts/windows-debug/sync.sh
```

Stop the instance when done (avoids cost):

```bash
./scripts/windows-debug/stop.sh
```

### Important notes

**SSM agent takes a long time to come online.** After starting or restarting the instance, the SSM agent can take 5 to 10 minutes before it accepts commands. If `run.sh` returns `InvalidInstanceId`, wait and retry. Do not assume the instance is broken; poll with increasing intervals.

**PowerShell uses `;` not `&&`.** The `run.sh` wrapper executes PowerShell, which does not support `&&` as a command separator. Use `;` instead:

```bash
./scripts/windows-debug/run.sh "cd C:\labelhost; pnpm test"
```

**OpenSSL may not be at the expected path.** The bootstrap installs OpenSSL to `C:\Program Files\OpenSSL-Win64\bin`, but this can fail silently. Git bundles its own OpenSSL at `C:\Program Files\Git\mingw64\bin`. If `openssl` is not found, add Git's path:

```bash
./scripts/windows-debug/run.sh '$env:PATH = "C:\Program Files\Git\mingw64\bin;$env:PATH"; openssl version'
```

**SSM runs as SYSTEM.** Commands execute as the SYSTEM account, not a normal user. This affects user-specific operations (e.g., `certutil -addstore -user Root` targets SYSTEM's trust store, not a real user's). Keep this in mind when testing user-facing features.

### Common Workflows

Run unit tests on Windows:

```bash
./scripts/windows-debug/run.sh "cd C:\labelhost; pnpm test"
```

Run e2e tests on Windows:

```bash
./scripts/windows-debug/run.sh "cd C:\labelhost; pnpm test:e2e"
```

Check bootstrap progress (first boot only):

```bash
./scripts/windows-debug/run.sh "Get-Content C:\bootstrap.log"
```

The repo lives at `C:\labelhost` on the instance. Node.js 24, pnpm 11, Git, and OpenSSL are pre-installed. The `run.sh` wrapper automatically adds these tools to PATH.

<!-- opensrc:start -->

## Source Code Reference

Source code for dependencies is available in `opensrc/` for deeper understanding of implementation details.

See `opensrc/sources.json` for the list of available packages and their versions.

Use this source code when you need to understand how a package works internally, not just its types/interface.

### Fetching Additional Source Code

To fetch source code for a package or repository you need to understand, run:

```bash
npx opensrc <package>           # npm package (e.g., npx opensrc zod)
npx opensrc pypi:<package>      # Python package (e.g., npx opensrc pypi:requests)
npx opensrc crates:<package>    # Rust crate (e.g., npx opensrc crates:serde)
npx opensrc <owner>/<repo>      # GitHub repo (e.g., npx opensrc vercel/ai)
```

<!-- opensrc:end -->
