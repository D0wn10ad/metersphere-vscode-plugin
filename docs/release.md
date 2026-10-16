# Release Process

## Stage 1: GitHub Release Automation

This repository uses GitHub Actions for two separate concerns:

- `CI`: runs on pushes to `main` and pull requests targeting `main`
- `Release`: runs only when a tag matching `v*` is pushed

Stage 1 automation does all of the following:

- installs dependencies with `npm ci`
- compiles the extension with `npm run compile`
- runs the full Jest suite with `npm test`
- validates that the git tag version matches `package.json`
- packages the extension into a `.vsix`
- uploads the `.vsix` as both a workflow artifact and a GitHub Release asset

Stage 1 does not publish to extension marketplaces.

## Maintainer Steps

1. Update `package.json` version.
2. Commit the version bump to `main`.
3. Push the commit.
4. Create a matching tag, for example `v0.2.1`.
5. Push the tag:

   ```bash
   git push origin v0.2.1
   ```

6. Wait for the `Release` workflow to finish.
7. Download the `.vsix` from the GitHub Release and smoke test it.

## Version Rule

The pushed tag must match `package.json` exactly after removing the leading `v`.

Example:

- `package.json`: `0.2.1`
- git tag: `v0.2.1`

If they do not match, the release workflow fails intentionally.

## Troubleshooting

### Tag mismatch failure

Check:

- the tag name
- the `package.json` version on the tagged commit

### VSIX not found

Check:

- `npm run package` output
- whether packaging created exactly one `.vsix` in repo root

### Packaging warnings

Warnings about missing `LICENSE` or many shipped files do not necessarily block Stage 1, but should be reviewed.

## Keep In View: Stage 2

Stage 2 may add:

- Visual Studio Marketplace publishing using `VSCE_PAT`
- Open VSX publishing using `OVSX_PAT`
- better release notes or changelog automation
- optional prerelease handling
