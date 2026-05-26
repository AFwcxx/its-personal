# Version Release Workflow

Use this checklist for patch releases such as `v0.0.2`.

## 1. Confirm Scope

Decide the target version and whether the release includes docs updates. Do not update historical plans, design snapshots, or archived notes unless the release explicitly requires it.

For this repo, active version surfaces are:

- `package.json`
- `package-lock.json`
- `apps/api/package.json`
- `apps/web/package.json`
- `packages/shared/package.json`
- `apps/web/src/components/AppShell.vue`

## 2. Set npm Supply-Chain Delay

Keep project npm installs behind a minimum release age:

```ini
min-release-age=2d
```

This lives in project `.npmrc`. Use npm 11 or newer so `min-release-age` is honored.

## 3. Bump Versions

Update all active package versions and internal workspace dependency references to the same version.

For example, for `0.0.2`:

```bash
npm version 0.0.2 --workspaces --include-workspace-root --no-git-tag-version
```

Then verify and fix anything the command misses, especially:

- `@its-personal/shared` dependency versions in workspace package files.
- Matching entries in `package-lock.json`.
- The visible app shell version label, such as `v0.0.2`.
- Incidental formatting churn in `package.json`.

## 4. Update Current Docs

Update current user-facing docs when the release includes behavior that is now true. Keep the docs scoped to current information.

Avoid changing:

- `docs/plans/`
- `docs/design/`
- old spec snapshots

## 5. Verify

Run:

```bash
npm run typecheck
npm test
npm run build
```

If API tests fail with `listen EPERM 0.0.0.0` in the sandbox, rerun tests with local socket permission. Do not report tests as passing unless the rerun passes.

`npm run e2e` is optional for a version-only release. Use it when the release changes browser workflows or when a release-level smoke test is needed.

## 6. Commit

Commit the release changes:

```bash
git add .npmrc README.md docs package.json package-lock.json apps/api/package.json apps/web/package.json apps/web/src/components/AppShell.vue packages/shared/package.json
git commit -m "chore: release v0.0.2"
```

Adjust paths if the release touches different files.

## 7. Create Annotated Tag

Create the annotated release tag on the release commit:

```bash
git tag -a v0.0.2 -m "v0.0.2"
```

Verify it is annotated:

```bash
git cat-file -t v0.0.2
```

Expected output:

```text
tag
```

## 8. Push

Push the commit and tag:

```bash
git push origin main
git push origin v0.0.2
```

GitHub only shows tags after they are pushed to the remote.

## 9. Final Check

Confirm:

```bash
git status --short --branch
git show --no-patch --format="%H %D %s" v0.0.2
```

Then check the GitHub tags page.
