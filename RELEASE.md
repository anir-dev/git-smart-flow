# Release Process

Internal guide for maintainers. Fully automated — no local commands required to publish.

## How It Works

Releases are managed automatically by [release-please](https://github.com/googleapis/release-please) (Google). The flow:

```
feat/fix branch → PR → merge to main
                    ↓
       release-please Action runs on main
                    ↓
    Opens / updates a Release PR:
      "chore(main): release X.Y.Z"
      - CHANGELOG.md updated
      - package.json version bumped
      - PR stays open until you decide to publish
      - Additional PRs merged to main update the Release PR automatically
                    ↓
    You merge the Release PR when ready to publish
                    ↓
    release-please creates:
      - tag vX.Y.Z
      - GitHub Release with CHANGELOG notes
                    ↓  (tag v* triggers release.yml)
    GitHub Actions:
      - build + tests + npm audit
      - pauses at "npm-publish" environment → manual approval required
      - npm publish --provenance --access public
      - builds standalone binaries (best-effort)
      - uploads binaries to the GitHub Release
                    ↓
    Package on npmjs.com ✓
    Binaries in GitHub Release ✓
```

## Prerequisites

- `NPM_TOKEN` secret configured in GitHub repository secrets (Settings → Secrets → Actions)
- `npm-publish` GitHub Environment with required reviewer `anir-dev` and deployment tag filter `v*`
- Node.js version matching `.nvmrc`

## Day-to-Day Flow

```bash
# 1. Create a feature or fix branch
git checkout -b feat/my-feature

# 2. Develop with conventional commits
git commit -m "feat(branch): add rename command"

# 3. Push and open a PR
git push -u origin feat/my-feature
# → open PR on GitHub → review → merge to main

# 4. release-please automatically opens or updates a Release PR
# → PR title: "chore(main): release X.Y.Z"
# → Each subsequent PR merged to main updates the Release PR

# 5. When ready to publish → merge the Release PR
# → tag vX.Y.Z is created automatically
# → release.yml workflow triggers

# 6. Approve the deployment in the "npm-publish" environment on GitHub Actions

# 7. Package published to npm ✓
```

**No local npm commands. No local version bumping. Zero local release steps.**

## Approving the npm-publish Deployment

After the Release PR is merged, `release.yml` pauses before publishing and waits for approval:

1. Go to `github.com/anir-dev/git-smart-flow/actions`
2. Click the workflow run for the release tag
3. Click **Review deployments**
4. Select `npm-publish` → **Approve and deploy**

The job then runs `npm publish --provenance --access public`.

## Post-Release Verification

```bash
# Wait ~2 minutes for npm propagation
npm view git-smart-flow version

# Verify the installed package works
npx git-smart-flow --version

# Verify SLSA provenance attestation
npm audit signatures
```

Checklist:
- [ ] npm page shows the new version
- [ ] GitHub Release exists with CHANGELOG and binary assets
- [ ] `npm audit signatures` shows verified provenance
- [ ] `npx git-smart-flow --version` outputs the correct version

## Hotfix Process

For urgent fixes, use a `fix:` conventional commit — release-please proposes a patch bump:

```bash
git checkout -b fix/security-vuln main
git commit -m "fix(security): remove credential logging in debug mode"
git push -u origin fix/security-vuln
# Open PR → merge to main → release-please updates Release PR to vX.Y.(Z+1)
# Merge the Release PR → tag created → approve in GitHub Actions → npm publish
```

## Rolling Back a Bad Release

npm does not support deleting published versions. Deprecate and cut a patch immediately:

```bash
npm deprecate git-smart-flow@X.Y.Z "Regression in X, upgrade to X.Y.(Z+1)"
```

Then open a fix PR, merge to main, and merge the next Release PR.

## npm Provenance (SLSA Level 2)

All releases include a signed SLSA provenance attestation linking the npm artifact to the exact GitHub Actions run that built it. Generated automatically by `npm publish --provenance` with `id-token: write` permissions — no local setup required.

Users can verify:

```bash
npm audit signatures
# or
gh attestation verify --owner anir-dev $(npm pack --dry-run --json | jq -r '.[0].filename')
```

## Versioning

See [`docs/versioning.md`](docs/versioning.md) for the complete guide on commit types, version bumps, and CHANGELOG generation.
