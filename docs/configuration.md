# Configuration Reference

Priority (highest to lowest): `CLI flags > local (.git-smart-flow.json) > global (~/.git-smart-flow/config.json) > defaults`

## Global Config — `~/.git-smart-flow/config.json`

```json
{
  "language": { "commit": "en", "prTitle": "en", "prBody": "en" },
  "ai": {
    "enabled": true,
    "provider": "heuristic",
    "mode": "enriched",
    "allowRawDiff": false,
    "showPromptBeforeSend": false,
    "ollamaModel": "llama3.2",
    "ollamaUrl": "http://localhost:11434"
  },
  "git": {
    "protectedBranches": ["main", "master", "develop"],
    "defaultBaseBranches": ["develop", "main", "master"]
  },
  "commit": {
    "convention": "conventional",
    "maxHeaderLength": 100,
    "requireTicket": "auto",
    "ticketPattern": "[A-Z][A-Z0-9]+-[0-9]+"
  },
  "security": {
    "blockOnSecrets": true,
    "redactSecrets": true,
    "blockedFiles": [".env", "*.pem", "*.key", "*.p12", "credentials.json", "secrets.json"]
  },
  "aliases": { "gsfc": false, "gsfm": false, "gsfp": false, "gsfpr": false }
}
```

## Local Config — `.git-smart-flow.json`

Repo-level overrides:
```json
{ "ai": { "provider": "ollama" }, "commit": { "maxHeaderLength": 72, "requireTicket": true } }
```

## Key Options

| Option | Values | Description |
|--------|--------|-------------|
| `ai.provider` | `heuristic`, `ollama`, `openai`, `claude`, `copilot` | AI provider |
| `ai.allowRawDiff` | `true/false` | Send raw diff to AI (default: false) |
| `commit.requireTicket` | `true`, `false`, `"auto"` | Require ticket in branch name |
| `security.blockOnSecrets` | `true/false` | Block commit if secrets detected |
| `git.protectedBranches` | `string[]` | Branches requiring confirmation |
