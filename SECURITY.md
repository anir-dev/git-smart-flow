# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.x     | Yes       |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

To report a security vulnerability:

1. Email: `security@YOUR_DOMAIN` (replace with your actual address)
2. Or use [GitHub Private Security Advisories](https://github.com/YOUR_USERNAME/git-smart-flow/security/advisories/new)

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

We will respond within 48 hours and aim to release a fix within 7 days for critical issues.

## Security Model

- git-smart-flow runs locally and never automatically sends data to remote services
- AI providers are opt-in and configurable
- Raw diffs are not sent to AI by default (`allowRawDiff: false`)
- The security scanner blocks commits containing detected secrets
- No credentials are stored in plaintext in the source code

See [docs/security.md](docs/security.md) for full details.
