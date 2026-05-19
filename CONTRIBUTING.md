# Contributing to git-smart-flow

Thank you for your interest in contributing!

## Local Setup

```bash
git clone https://github.com/anir-dev/git-smart-flow.git
cd git-smart-flow
npm install
npm run build
npm link          # makes git-smart-flow / gsf available globally
git-smart-flow --version
```

## Development Workflow

```bash
npm run dev               # run with tsx (no build step)
npm run build             # compile TypeScript
npm test                  # run all tests
npm run smoke             # end-to-end smoke test
```

## Commit Convention

This project uses **Conventional Commits** (we eat our own dogfood):

```
feat(scope): add something new
fix(scope): fix a bug
docs: update documentation
test: add or update tests
chore: maintenance tasks
refactor: code changes without functional impact
```

Run `git-smart-flow commit` to generate your commit message.

## Adding a New AI Provider

1. Create `src/providers/<name>.provider.ts` extending `BaseProvider`
2. Implement `isAvailable()`, `generateCommitMessage()`, `generatePRDescription()`
3. Register it in `src/providers/provider.factory.ts`
4. Add it to the `ProviderName` type in `src/types/index.ts`
5. Add detection in `setup.ts` and `doctor.ts`
6. Add tests in `tests/provider-factory.test.ts`
7. Document in `docs/providers.md`

## Pull Request Process

1. Fork and create a branch: `feat/your-feature` or `fix/issue-description`
2. Make your changes with tests
3. Verify: `npm run build && npm test && npm run smoke`
4. Submit a PR using the PR template

## Release Process

Releases are handled by CI when a `v*` tag is pushed. Maintainers run:

```bash
npm run prepare-release   # local: build + test + pack + binaries
npm run release           # publishes to npm + creates GitHub Release
```
