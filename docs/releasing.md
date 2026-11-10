# Releasing

Releases use npm package versions and matching Git tags such as `v0.2.2`. Publishing a stable GitHub release triggers [the npm publishing workflow](../.github/workflows/publish.yml).

## One-time npm setup

In [the package settings](https://www.npmjs.com/package/opencode-board/access), add a **Trusted Publisher** with these exact values:

| Field | Value |
| --- | --- |
| Publisher | GitHub Actions |
| Organization or user | `dbpolito` |
| Repository | `opencode-board` |
| Workflow filename | `publish.yml` (not the full path) |
| Environment name | Leave blank |
| Allowed actions | Enable direct publishing with `npm publish` |

Commit and push the workflow before creating the next release. npm requires the first successful publish within two days of creating a trusted publisher; if it expires, delete it and create it again before releasing.

No `NPM_TOKEN` secret is needed. The workflow uses GitHub-hosted runners, Node 24, npm 11, and OIDC with `id-token: write`. npm automatically includes provenance for this public repository/package.

After the first successful automated publish, consider selecting **Require two-factor authentication and disallow tokens** under npm's **Publishing access** settings, and revoke any old publishing tokens. This does not block Trusted Publishing.

## Prepare a release

Increment the version and check what npm will publish:

```sh
npm version patch --no-git-tag-version
npm publish --dry-run
```

The `prepublishOnly` hook runs type checks, builds the GUI/server/RPC entries, and runs the tests. The package should contain `dist/gui-experimental.cjs`, `dist/server.js`, `dist/rpc.js`, the README, package metadata, and MIT license.

Check the board in OpenCode Desktop too. The automated tests do not cover Desktop rendering or pointer interactions.

Commit and tag the release:

```sh
git add package.json
git commit -m "Release next version"
git tag -a "v$(node -p 'require("./package.json").version')" -m "Release"
git push --follow-tags
```

## Publish a release

After pushing the commit and annotated tag, create and publish a GitHub release for that tag:

```sh
gh release create "v$(node -p 'require("./package.json").version')" --verify-tag --generate-notes
```

The **Publish to npm** workflow checks out the release tag, verifies it matches `package.json`, installs from `bun.lock`, and runs `npm publish`. Its `prepublishOnly` hook performs the checks, build, and tests before uploading anything. Drafts and prereleases do not publish to npm. Tags alone do not trigger publication.

Watch the run in GitHub's **Actions** tab. If publishing fails, fix the cause and re-run the failed job. npm versions are immutable; if that version already exists on npm, verify it rather than trying to overwrite it.

Existing releases do not trigger automatically when this workflow is added. Use it starting with the next release; do not move old release tags to add the workflow.

## Manual fallback

If needed, you can still publish locally:

```sh
npm login
npm publish
```

npm may ask you to authenticate in the browser. Don't manually publish the same version while the automated workflow is running. Each published version is unique, so increment the version before publishing another release.

The repository README can change independently of a release. Updating the README displayed on npm requires publishing a new package version.
