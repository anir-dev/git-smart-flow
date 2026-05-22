# Versioning Guide

git-smart-flow uses [Semantic Versioning](https://semver.org) with fully automated version management via [release-please](https://github.com/googleapis/release-please). Version bumps, CHANGELOG entries, and release tags are all derived from [Conventional Commits](https://www.conventionalcommits.org).

**You never manually edit `package.json` version or `CHANGELOG.md`.**

---

## Semantic Versioning

```
MAJOR . MINOR . PATCH
  │       │       └── Bug fixes, docs, performance, security patches
  │       └────────── New features (backward-compatible)
  └────────────────── Breaking changes (not backward-compatible)
```

| Release | When | Example |
|---|---|---|
| `patch` (0.1.**x**) | Bug fix, docs, performance, refactor, security | 0.1.0 → 0.1.1 |
| `minor` (0.**x**.0) | New feature, new command, new option | 0.1.0 → 0.2.0 |
| `major` (**x**.0.0) | Breaking CLI change, removed command, changed config format | 0.1.0 → 1.0.0 |

### Pre-v1.0 behavior (`bump-minor-pre-major: true`)

While the project is on `0.x`, breaking changes trigger a **minor** bump instead of major. This is intentional: `0.x` is explicitly pre-stable. Once the project reaches `1.0.0`, breaking changes will trigger major bumps as usual.

---

## Conventional Commits Format

Every commit must follow this format:

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### Types and their version impact

| Type | Description | Version bump | In CHANGELOG |
|---|---|---|---|
| `feat` | New feature, new command, new option | **minor** | Yes — Features |
| `fix` | Bug fix | **patch** | Yes — Bug Fixes |
| `perf` | Performance improvement | **patch** | Yes — Performance |
| `refactor` | Refactor (no feature, no fix) | **patch** | Yes — Refactors |
| `docs` | Documentation only | **patch** | Yes — Documentation |
| `security` | Security fix or hardening | **patch** | Yes — Security |
| `test` | Tests only | no release | No |
| `chore` | Build, CI, config, release automation | no release | No |
| `style` | Formatting only | no release | No |
| `ci` | CI configuration | no release | No |

Types with "no release" still appear in git history but do not trigger a version bump or CHANGELOG entry.

### Breaking changes

Two equivalent ways to mark a breaking change:

**Option 1 — exclamation mark after the type:**
```
feat!: rename --force flag to --overwrite
```

**Option 2 — BREAKING CHANGE footer:**
```
feat(branch): add rename command

BREAKING CHANGE: the `--force` flag has been renamed to `--overwrite`.
Users must update any scripts that call `gsf branch --force`.
```

Both produce a **major** bump (or **minor** during `0.x` — see above).

---

## Scopes (optional but recommended)

Scopes appear in the CHANGELOG and help readers filter changes by area:

```
feat(commit): add --amend flag
fix(push): handle detached HEAD state
docs(readme): update AI provider list
refactor(repo): use spawnSync instead of execSync
security(scanner): add detection for AWS session tokens
```

Useful scopes (not enforced, use what makes sense):
- Commands: `branch`, `commit`, `push`, `merge`, `revert`, `sync`, `pr`, `config`, `log`, `info`
- Core: `repo`, `validate`, `scanner`, `providers`, `ux`, `renderer`
- Infra: `readme`, `docs`, `ci`, `release`, `build`

---

## How release-please Determines the Version

When a PR is merged to `main`, the release-please GitHub Action:

1. Reads all commits since the last release tag (e.g., `v0.1.0`)
2. Finds the highest-impact commit type across all commits:
   - Any `BREAKING CHANGE` or `!` → **major** (or **minor** during `0.x`)
   - Any `feat` → **minor**
   - Any `fix`, `docs`, `perf`, `refactor`, `security` → **patch**
3. Proposes that bump in the Release PR (`chore(main): release X.Y.Z`)
4. Updates `CHANGELOG.md` grouped by type
5. Updates `version` in `package.json`
6. Updates `.release-please-manifest.json` (internal state)

### Accumulation between releases

The Release PR stays open and accumulates all new commits. Merging more PRs to `main` before merging the Release PR just updates it:

```
merge feat/ai-provider  → Release PR proposes 0.2.0
merge fix/push-crash    → Release PR: still 0.2.0 (feat dominates)
merge docs/readme       → Release PR: still 0.2.0
[merge the Release PR]  → tag v0.2.0, CHANGELOG contains all 3
```

This means you can batch multiple features and fixes into a single release by simply waiting before merging the Release PR.

---

## What Appears in the CHANGELOG

release-please only includes these types in the CHANGELOG:

| Commit type | CHANGELOG section |
|---|---|
| `feat` | Features |
| `fix` | Bug Fixes |
| `perf` | Performance |
| `refactor` | Refactors |
| `docs` | Documentation |
| `security` | Security |
| Any breaking change | Breaking Changes |

Types `test`, `chore`, `style`, `ci` are excluded — they add noise without user-facing value.

---

## Examples: Good vs Bad Commits

### Good

```bash
feat(branch): add interactive rename command
fix(push): handle missing upstream gracefully
fix(scanner): detect GitHub PATs with new token prefix
docs(readme): add Ollama provider configuration example
perf(repo): cache git status result within the same invocation
refactor(validate): extract shared branch name regex to constant
security(scanner): detect .env files staged for commit
feat!: remove deprecated --interactive flag (use --yes instead)
```

### Bad

```bash
# Too vague — what changed? In what area?
update stuff

# Not conventional format — ignored by release-please
Fixed the push command

# Mixing concerns — split into two commits
feat(branch): add rename + fix push crash

# Wrong type — this is a feat, not a fix
fix(branch): add delete command

# chore for something that's actually a feature
chore: add new sync command
```

---

## Commitlint Enforcement

Conventional commits are enforced by [commitlint](https://commitlint.js.org) via a [husky](https://typicode.github.io/husky) `commit-msg` hook. Non-conforming messages are rejected before they enter the repo.

If your commit is rejected:

```bash
# Check the expected format
cat commitlint.config.js

# Fix the message before pushing
git commit --amend -m "feat(push): add --force-with-lease support"
```
