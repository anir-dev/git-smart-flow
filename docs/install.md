# Installation Guide

## Requirements

- Node.js >= 18 (for npm)
- Git >= 2.x

## Method 1 — npm

```bash
npm install -g git-smart-flow
git-smart-flow setup
```

## Method 2 — Install script

**macOS / Linux:**
```bash
curl -fsSL https://raw.githubusercontent.com/YOUR_USERNAME/git-smart-flow/main/installers/macos/install.sh | bash
```

**Windows (PowerShell):**
```powershell
iwr https://raw.githubusercontent.com/YOUR_USERNAME/git-smart-flow/main/installers/windows/install.ps1 | iex
```

## Method 3 — Standalone binary (no Node.js)

Download from [Releases](https://github.com/YOUR_USERNAME/git-smart-flow/releases), unzip, move to PATH.

## Verify

```bash
git-smart-flow --version
git-smart-flow doctor
```

## Uninstall

```bash
npm uninstall -g git-smart-flow
```
