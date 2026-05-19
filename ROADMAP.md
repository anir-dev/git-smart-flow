# Roadmap

> This roadmap represents intended direction, not commitments. Priorities shift based on user feedback and available time.

## Current: v0.x — Foundation

**Goal:** Stable core for daily personal use; ready for early external contributors.

- [x] Core Git abstraction layer (`src/git/`)
- [x] Heuristic commit message generation (offline, no AI)
- [x] AI providers: OpenAI, Claude, Ollama, GitHub Copilot
- [x] Interactive commit wizard (`gsfc`)
- [x] Security scanner (secret detection before commit)
- [x] Protected branch enforcement
- [x] Interactive push with pre-push validation (`gsfp`)
- [x] Guided merge (`gsfm`)
- [x] PR description generator (`gsfpr`)
- [x] `doctor` command for environment diagnostics
- [x] Interactive setup wizard
- [x] Git hook installer
- [x] Configuration system (global + per-repo)
- [x] Ink v5 interactive UI layer
- [ ] Input validation layer (`src/git/validate.ts`) — in progress
- [ ] npm provenance / SLSA Level 2 release pipeline
- [ ] CodeQL + Dependabot setup
- [ ] 80%+ unit test coverage on core modules

## Next: v1.0 — Public Release

**Goal:** Production-quality, fully documented, accepting external contributions.

- [ ] Stable public API for plugin authors
- [ ] Full documentation site (VitePress or Docusaurus)
- [ ] Dry-run flag (`--dry-run`) on all destructive commands
- [ ] `--no-interactive` / `--yes` flag for CI/scripting use
- [ ] Monorepo support (detection + per-package conventions)
- [ ] `gsf log` interactive commit history browser
- [ ] `gsf sync` smart rebase/merge workflow
- [ ] Scoped config inheritance (workspace → project → user → system)
- [ ] Audit log: append-only local log of all git operations performed
- [ ] Shell completion for bash, zsh, fish

## Future: v1.x — Ecosystem

- [ ] Plugin system: third-party providers via `gsf-plugin-*` packages
- [ ] Team configuration sharing (shareable configs like ESLint)
- [ ] GitHub / GitLab native integration (create PRs directly via API)
- [ ] Pre-flight PR checklist (custom rules per repo)
- [ ] AI cost dashboard (track API usage)
- [ ] Optional telemetry (opt-in, anonymous, to inform roadmap decisions)

## Intentionally Out of Scope

- GUI / Electron app
- GitHub Actions replacement
- Code review automation (focus stays on Git workflow, not code quality)
- Hosting / SaaS

---

Suggest priorities via [GitHub Discussions](https://github.com/anir-dev/git-smart-flow/discussions).
