# git-smart-flow

> Interactive CLI to manage Git workflows guided, safe and smart

[![CI](https://github.com/anir-dev/git-smart-flow/actions/workflows/ci.yml/badge.svg)](https://github.com/anir-dev/git-smart-flow/actions)
[![npm version](https://badge.fury.io/js/git-smart-flow.svg)](https://www.npmjs.com/package/git-smart-flow)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**git-smart-flow** helps developers manage Git tasks in a guided, safe, and interactive way. It generates commit messages following the detected convention in your repository, creates assisted PRs, validates branches, and reviews changes before pushing — all from the terminal.

Works with or without AI. The heuristic provider always works offline.

---

## Quick Install

```bash
npm install -g git-smart-flow
git-smart-flow setup
```

Or via script (macOS/Linux):

```bash
curl -fsSL https://raw.githubusercontent.com/anir-dev/git-smart-flow/main/installers/macos/install.sh | bash
```

Or download a [standalone binary](https://github.com/anir-dev/git-smart-flow/releases) (no Node.js required).

---

## Commands

| Command | Alias | Description |
|---------|-------|-------------|
| `git-smart-flow setup` | — | Interactive setup wizard |
| `git-smart-flow commit` | `gsfc` | Guided commit assistant |
| `git-smart-flow commit-message` | — | Generate commit message (no commit) |
| `git-smart-flow pr` | `gsfpr` | Generate PR title and description |
| `git-smart-flow validate` | — | Validate repository state |
| `git-smart-flow push` | `gsfp` | Validated push with confirmation |
| `git-smart-flow merge` | `gsfm` | Assisted merge |
| `git-smart-flow doctor` | — | Full environment diagnostic |
| `git-smart-flow info` | — | Show current repository context |
| `git-smart-flow config` | — | Edit configuration |
| `git-smart-flow install-hooks` | — | Install Git hooks |

---

## AI Providers

| Provider | Cost | Privacy | Requirement |
|----------|------|---------|-------------|
| Heuristic (default) | Free | Local | None |
| Ollama | Free | Local, private | Ollama running locally |
| GitHub Copilot CLI | Subscription | Remote | `gh copilot` CLI |
| OpenAI API | Pay-per-use | Remote | `OPENAI_API_KEY` |
| Claude API | Pay-per-use | Remote | `ANTHROPIC_API_KEY` |

Configure with `git-smart-flow setup` or `git-smart-flow config`.

---

## Project Structure

```
src/
  cli.ts              Entry point
  commands/           One file per command
  config/             Config loading and merging
  git/                Git operations, convention detection, AI context builder
  providers/          AI providers (heuristic, ollama, openai, claude, copilot)
  security/           Secret and sensitive file scanner
  types/              Shared TypeScript interfaces
  ux/                 Display, prompts, spinner, menus
tests/                Node.js native test runner
scripts/              prepare-release.ts, smoke-test.sh
installers/           macOS, Linux, Windows install scripts
docs/                 User documentation
```

---

## Local Development

```bash
git clone https://github.com/anir-dev/git-smart-flow.git
cd git-smart-flow
npm install
npm run build
npm link          # makes gsf / git-smart-flow available globally
gsf --version
```

---

## Testing

```bash
npm test              # 48 unit tests with Node.js native runner
npm run smoke         # End-to-end smoke test in a temp repo
```

---

## Release

```bash
# Local release preparation (build + test + npm pack + standalone binaries)
npm run prepare-release

# Publish (requires npm login and git tag)
npm run release
```

CI automatically publishes to npm and creates a GitHub Release when a `v*` tag is pushed.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Security

See [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE) — 2025 YOUR_NAME
