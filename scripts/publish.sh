#!/usr/bin/env bash
#
# Manual npm publish route.
#
# The normal route is .github/workflows/release.yml, which publishes on merge to
# main. Use this script when the workflow cannot authenticate: the first publish
# of a new package name (npm trusted publishing can only be configured on a
# package that already exists), or a registry outage on the runner.
#
# Both routes are interchangeable. release.yml compares the local version to npm
# and skips publishing when they already match, so a manual publish followed by a
# merge to main still gets its GitHub release created automatically.
#
# Provenance is not generated here. npm can only attest a build that ran in a
# supported CI environment, so a manually published version carries no
# provenance. Prefer the workflow route once it works.

set -euo pipefail

cd "$(dirname "$0")/.."

PKG_DIR="packages/labelhost"
NAME=$(node -p "require('./$PKG_DIR/package.json').name")
VERSION=$(node -p "require('./$PKG_DIR/package.json').version")

echo "Publishing $NAME@$VERSION from the local machine."
echo

fail() {
  echo "Error: $1" >&2
  exit 1
}

# The tarball must correspond to a committed state, or there is no way to tell
# later what was published.
if [ -n "$(git status --porcelain)" ]; then
  fail "working tree is dirty. Commit or stash first."
fi

# npm rejects a republish anyway, but failing here keeps the build out of it.
if [ -n "$(npm view "$NAME@$VERSION" version 2>/dev/null || true)" ]; then
  fail "$NAME@$VERSION is already on npm. Bump the version first."
fi

# release.yml reads the release body from between these markers. A publish
# without them leaves the GitHub release job to fail later.
if ! grep -q '<!-- release:start -->' CHANGELOG.md; then
  fail "CHANGELOG.md has no <!-- release:start --> marker."
fi

if ! npm whoami >/dev/null 2>&1; then
  fail "not logged in to npm. Run 'npm login' first."
fi

# The workflow route gets these checks from ci.yml before the merge that
# triggers it. This route bypasses CI, so run them here.
echo "Running checks..."
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm type-check
pnpm build
pnpm test

echo
echo "Checks passed. Publishing..."
cd "$PKG_DIR"
npm publish

echo
echo "Published $NAME@$VERSION."
echo
echo "Next: merge to main so release.yml creates the v$VERSION GitHub release,"
echo "or dispatch the Release workflow manually if the version is already on main."
echo "Then configure npm trusted publishing so the workflow route can take over:"
echo "  npmjs.com -> $NAME -> Settings -> Trusted Publisher"
echo "  repository WataruNishimura/labelhost, workflow release.yml, environment Release"
