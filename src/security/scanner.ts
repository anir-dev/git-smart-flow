import { basename } from 'path';
import type { SecurityScanResult } from '../types/index.js';

const SECRET_PATTERNS: Array<{ name: string; regex: RegExp }> = [
  { name: 'password assignment', regex: /password\s*=\s*['"][^'"]{4,}/i },
  { name: 'passwd assignment', regex: /passwd\s*=\s*['"][^'"]{4,}/i },
  { name: 'secret assignment', regex: /secret\s*=\s*['"][^'"]{4,}/i },
  { name: 'token assignment', regex: /token\s*=\s*['"][^'"]{4,}/i },
  { name: 'api_key assignment', regex: /api_?key\s*=\s*['"][^'"]{4,}/i },
  { name: 'private_key', regex: /private[_-]key/i },
  {
    name: 'Authorization header',
    regex: /Authorization\s*:\s*['"]?\s*Bearer\s+[A-Za-z0-9._\-+/]{10,}/i,
  },
  { name: 'client_secret', regex: /client[_-]secret\s*[:=]\s*['"][^'"]{4,}/i },
  { name: 'access_token', regex: /access[_-]token\s*[:=]\s*['"][^'"]{4,}/i },
  { name: 'refresh_token', regex: /refresh[_-]token\s*[:=]\s*['"][^'"]{4,}/i },
  { name: 'AWS_SECRET', regex: /AWS_SECRET_ACCESS_KEY\s*[:=]\s*['"]?[A-Za-z0-9/+]{20,}/i },
  { name: 'GITHUB_TOKEN', regex: /GITHUB_TOKEN\s*[:=]\s*['"]?ghp_[A-Za-z0-9]{36}/i },
  { name: 'private key block', regex: /-----BEGIN\s+\w*\s*PRIVATE KEY-----/ },
  { name: 'certificate block', regex: /-----BEGIN CERTIFICATE-----/ },
  { name: 'long alphanumeric token', regex: /['"` ][A-Za-z0-9_\-]{40,}['"` ]/ },
];

const SENSITIVE_FILE_PATTERNS: Array<RegExp> = [
  /^\.env(\..+)?$/,
  /\.pem$/,
  /\.key$/,
  /\.p12$/,
  /^id_rsa$/,
  /^id_dsa$/,
  /^id_ed25519$/,
  /^id_ecdsa$/,
  /^credentials\.json$/,
  /^secrets\.json$/,
  /^\.npmrc$/,
  /^\.netrc$/,
];

export interface ScanTarget {
  path: string;
  content?: string;
}

export function scanFiles(
  targets: ScanTarget[],
  blockedFilePatterns: string[]
): SecurityScanResult {
  const blockedFiles: string[] = [];
  const detectedSecrets: SecurityScanResult['detectedSecrets'] = [];

  for (const target of targets) {
    const name = basename(target.path);

    if (isSensitiveFile(name, blockedFilePatterns)) {
      blockedFiles.push(target.path);
      continue;
    }

    if (target.content) {
      const secrets = scanContent(target.path, target.content);
      detectedSecrets.push(...secrets);
    }
  }

  const clean = blockedFiles.length === 0 && detectedSecrets.length === 0;

  return {
    clean,
    blockedFiles,
    detectedSecrets,
    redactionsApplied: 0,
    summary: buildSummary(blockedFiles, detectedSecrets),
  };
}

export function scanDiff(
  diff: string,
  filePaths: string[],
  blockedFilePatterns: string[]
): SecurityScanResult {
  const targets: ScanTarget[] = filePaths.map((path) => ({
    path,
    content: extractDiffContent(diff, path),
  }));
  return scanFiles(targets, blockedFilePatterns);
}

export function redactContent(content: string): { redacted: string; count: number } {
  let redacted = content;
  let count = 0;
  for (const { regex } of SECRET_PATTERNS) {
    const newContent = redacted.replace(regex, (match) => {
      count++;
      return match.substring(0, 8) + '***REDACTED***';
    });
    redacted = newContent;
  }
  return { redacted, count };
}

export function isSensitiveFile(filename: string, extraPatterns: string[] = []): boolean {
  for (const pattern of SENSITIVE_FILE_PATTERNS) {
    if (pattern.test(filename)) return true;
  }
  for (const pattern of extraPatterns) {
    const regex = globToRegex(pattern);
    if (regex.test(filename)) return true;
  }
  return false;
}

function scanContent(filePath: string, content: string): SecurityScanResult['detectedSecrets'] {
  const findings: SecurityScanResult['detectedSecrets'] = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    for (const { name, regex } of SECRET_PATTERNS) {
      if (regex.test(lines[i] ?? '')) {
        findings.push({ file: filePath, line: i + 1, pattern: name });
        break;
      }
    }
  }
  return findings;
}

function extractDiffContent(diff: string, filePath: string): string {
  const lines = diff.split('\n');
  const fileStart = lines.findIndex((l) => l.startsWith('+++ b/') && l.includes(filePath));
  if (fileStart === -1) return '';
  const added: string[] = [];
  for (let i = fileStart + 1; i < lines.length; i++) {
    if ((lines[i] ?? '').startsWith('diff --git')) break;
    if ((lines[i] ?? '').startsWith('+') && !(lines[i] ?? '').startsWith('+++')) {
      added.push((lines[i] ?? '').slice(1));
    }
  }
  return added.join('\n');
}

function buildSummary(blocked: string[], secrets: SecurityScanResult['detectedSecrets']): string {
  if (blocked.length === 0 && secrets.length === 0) return 'No security issues found.';
  const parts: string[] = [];
  if (blocked.length > 0) parts.push(`${blocked.length} sensitive file(s) blocked`);
  if (secrets.length > 0) parts.push(`${secrets.length} potential secret(s) detected`);
  return parts.join('; ');
}

function globToRegex(pattern: string): RegExp {
  // Order matters: escape special regex chars first, then expand glob tokens.
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&') // escape regex metacharacters
    .replace(/\*\*/g, '\x00') // temporarily protect **
    .replace(/\*/g, '[^/]*') // * = any chars except separator
    .replace(/\x00/g, '.*') // ** = any chars including separator
    .replace(/\?/g, '[^/]'); // ? = any single char except separator
  return new RegExp(`^${escaped}$`, 'i');
}
