# Publishing Guide

How to release the extension to both marketplaces. The VSIX is identical for both.

## 1. Build the VSIX

```bash
npm run compile
npm run package        # produces laravel-api-generator-<version>.vsix
```

## 2. VS Code Marketplace (Microsoft)

Uses the existing publisher `Nameless0l` (Azure DevOps PAT).

```bash
npx vsce publish -p <VSCE_PAT>
# or publish the already-built file:
npx vsce publish --packagePath laravel-api-generator-<version>.vsix -p <VSCE_PAT>
```

## 3. Open VSX (Cursor, VSCodium, Windsurf, Gitpod, Theia…)

One-time setup:

1. Create an account on <https://open-vsx.org> (sign in with GitHub).
2. Sign the Eclipse publisher agreement when prompted (linked from your
   Open VSX profile page — required before the first publish).
3. Create the namespace matching the `publisher` field in package.json:
   ```bash
   npx ovsx create-namespace Nameless0l -p <OVSX_PAT>
   ```
   (Generate the token under Profile → Access Tokens on open-vsx.org.)

Every release afterwards:

```bash
npx ovsx publish laravel-api-generator-<version>.vsix -p <OVSX_PAT>
```

## 4. Automated releases (GitHub Actions)

`.github/workflows/release.yml` builds the VSIX on every `v*` tag and
attaches it to the GitHub release. If the repository secrets `VSCE_PAT`
and/or `OVSX_PAT` are configured (Settings → Secrets and variables →
Actions), the workflow also publishes to the corresponding marketplace;
without the secrets those steps are skipped silently.

## Release checklist

- [ ] `CHANGELOG.md` updated, version bumped in `package.json`
- [ ] `npm run compile && npm run package` — check the VSIX is < 1 MB
- [ ] Install the VSIX locally and smoke-test (`code --install-extension …`)
- [ ] `git tag v<version> && git push --tags`
- [ ] Marketplace badges in README show the new version after ~10 min
