# Troubleshooting

## "Not a Git repository"

Run from inside a Git repository, or `git init` first.

## Wrong convention detected

```bash
git-smart-flow info     # shows detected convention
git-smart-flow doctor   # full diagnostic
```

Override: `.git-smart-flow.json` → `{ "commit": { "convention": "conventional" } }`

## AI provider not working

```bash
git-smart-flow doctor   # shows available providers
```

git-smart-flow always falls back to heuristic if the provider fails.

## Secret detected — commit blocked

Remove the secret from staged files. Use env vars instead of hardcoded credentials.

## Command not found after npm install

```bash
export PATH="$(npm config get prefix)/bin:$PATH"
```
