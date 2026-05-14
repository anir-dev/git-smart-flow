# AI Providers

git-smart-flow supports multiple AI providers with automatic fallback to the heuristic provider.

## Comparison Table

| Provider | Cost | Privacy | Internet | Requirement | Quality |
|----------|------|---------|----------|-------------|---------|
| **Heuristic** | Free | Local | No | None | Good (rule-based) |
| **Ollama** | Free | Local | No | Ollama installed | Very good |
| **GitHub Copilot CLI** | Subscription | Remote | Yes | `gh copilot` CLI | Very good |
| **OpenAI API** | Pay-per-use | Remote | Yes | `OPENAI_API_KEY` | Excellent |
| **Claude API** | Pay-per-use | Remote | Yes | `ANTHROPIC_API_KEY` | Excellent |

## Heuristic Provider (default)

No AI, no internet, no API keys. Uses file paths and extensions to infer commit type and scope. Always available as fallback.

## Ollama (recommended for privacy-conscious teams)

Runs models locally. No data leaves your network.

```bash
brew install ollama
ollama pull llama3.2
git-smart-flow config   # → AI provider → ollama
```

Config:
```json
{ "ai": { "provider": "ollama", "ollamaUrl": "http://localhost:11434", "ollamaModel": "llama3.2" } }
```

## GitHub Copilot CLI

```bash
gh extension install github/gh-copilot
git-smart-flow config   # → AI provider → copilot
```

## OpenAI API

```bash
export OPENAI_API_KEY=sk-...
git-smart-flow config
```
Default model: `gpt-4o-mini`. Override with `ai.model` in config.

## Claude API (Anthropic)

```bash
export ANTHROPIC_API_KEY=sk-ant-...
git-smart-flow config
```
Default model: `claude-haiku-4-5-20251001`.

## Privacy Recommendation

For teams with strict privacy requirements, use **Ollama**. No data ever leaves your network.
