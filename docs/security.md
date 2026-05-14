# Security

## What Gets Sent to AI

By default, git-smart-flow **never sends your raw diff** to any AI provider.

**Sent:** repository name, branch name, list of changed files with status, heuristic summaries, detected convention rules.

**Never sent:** raw diff content (unless `ai.allowRawDiff: true`), file contents, API keys.

## Secret Detection

Runs automatically before every commit and push.

**Files blocked by name:** `.env`, `*.pem`, `*.key`, `*.p12`, `id_rsa`, `credentials.json`, `secrets.json`

**Patterns detected in content:** `password=`, `secret=`, `token=`, `api_key=`, `Authorization: Bearer`, `AWS_SECRET_ACCESS_KEY`, `GITHUB_TOKEN`, `-----BEGIN PRIVATE KEY-----`

## Configuration

```json
{
  "security": {
    "blockOnSecrets": true,
    "redactSecrets": true,
    "blockedFiles": [".env", "*.pem", "*.key"]
  }
}
```

## Reporting Security Issues

See [SECURITY.md](../SECURITY.md).
