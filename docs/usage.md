# Usage Guide

## Getting Started

```bash
git-smart-flow setup     # Run once to configure
gsf                      # Open interactive menu
```

## Commit Assistant

```bash
git-smart-flow commit                        # gsfc
git-smart-flow commit-message                # generate only, no commit
git-smart-flow commit-message --no-ai        # heuristic, offline
git-smart-flow commit-message --show-prompt  # show AI context
```

## PR Description

```bash
git-smart-flow pr        # gsfpr
```

## Validation & Diagnostic

```bash
git-smart-flow validate
git-smart-flow doctor
git-smart-flow info
```

## Push & Merge

```bash
git-smart-flow push      # gsfp — asks for confirmation
git-smart-flow merge     # gsfm — interactive
```

## Hooks

```bash
git-smart-flow install-hooks   # commit-msg + pre-push
```
