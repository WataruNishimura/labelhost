#!/usr/bin/env bash
#
# Manual npm publish route.
#
# The normal route is .github/workflows/release.yml, which stages on merge to
# main and waits for a maintainer to approve with 2FA. Use this script when that
# route cannot run: the first publish of a new package name, which neither
# trusted publishing nor staging can bootstrap since both require the package to
# already exist, or a registry outage on the runner.
#
# This script publishes directly rather than staging. It runs under your own
# session token, so the trust relationship's permissions do not apply and npm
# prompts for 2FA itself, which is the same proof-of-presence staging defers.
#
# Both routes are interchangeable. release.yml compares the local version to npm
# and stages nothing when they already match, so a manual publish followed by a
# merge to main still gets its GitHub release created.
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
vp install --frozen-lockfile
vp run format:check
vp run lint
vp run type-check
vp run build
vp run test

echo
echo "Checks passed. Publishing..."
cd "$PKG_DIR"
npm publish

echo
echo "Published $NAME@$VERSION."
echo
echo "It is live on npm now: publishing directly skips the staging approval."
echo
echo "Next: merge to main, or dispatch the Release workflow if the version is"
echo "already there, so release.yml creates the v$VERSION GitHub release."
