# Releasing

Releases use npm package versions and matching Git tags such as `v0.1.0`.

## Prepare a release

Increment the version and check what npm will publish:

```sh
npm version patch --no-git-tag-version
npm publish --dry-run
```

The `prepublishOnly` hook runs type checks, builds the GUI, and runs the tests. The package should contain the built bundle, README, package metadata, and MIT license.

Check the board in OpenCode Desktop too. The automated tests do not cover Desktop rendering or pointer interactions.

Commit and tag the release:

```sh
git add package.json
git commit -m "Release next version"
git tag -a "v$(node -p 'require("./package.json").version')" -m "Release"
git push --follow-tags
```

## Publish

```sh
npm login
npm publish
```

npm may ask you to authenticate in the browser. Each published version is unique, so increment the version before publishing another release.

The repository README can change independently of a release. Updating the README displayed on npm requires publishing a new package version.
