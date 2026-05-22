/**
 * Input validation for Git operations.
 *
 * All user-supplied strings that flow into git commands must pass through
 * these validators before reaching spawnSync. This prevents path traversal,
 * shell metacharacter injection (even in array args), and unintended git
 * flag injection (e.g. a branch name of "--upload-pack=evil").
 */

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

const BRANCH_MAX_LENGTH = 250;

/**
 * Validates a git branch name against git's own rules plus injection guards.
 * Reference: git-check-ref-format(1)
 */
export function validateBranchName(name: string): ValidationResult {
  if (!name || name.trim().length === 0) {
    return { valid: false, reason: 'Branch name cannot be empty' };
  }
  if (name.length > BRANCH_MAX_LENGTH) {
    return { valid: false, reason: `Branch name exceeds ${BRANCH_MAX_LENGTH} characters` };
  }
  // Prevent flag injection: git treats args starting with "-" as options.
  if (name.startsWith('-')) {
    return { valid: false, reason: 'Branch name cannot start with a hyphen' };
  }

  const rules: Array<{ test: RegExp; reason: string }> = [
    { test: /\.\./, reason: 'Cannot contain consecutive dots (..)' },
    { test: /^\./, reason: 'Cannot start with a dot' },
    { test: /\.$/, reason: 'Cannot end with a dot' },
    { test: /\s/, reason: 'Cannot contain whitespace' },
    { test: /[~^:?*\[\\]/, reason: 'Contains invalid character (~^:?*[\\)' },
    { test: /\.lock$/, reason: 'Cannot end with .lock' },
    { test: /@\{/, reason: 'Cannot contain @{' },
    { test: /\/$/, reason: 'Cannot end with /' },
    { test: /\/\//, reason: 'Cannot contain consecutive slashes' },
    { test: /\x00/, reason: 'Cannot contain null bytes' },
  ];

  for (const { test, reason } of rules) {
    if (test.test(name)) return { valid: false, reason };
  }

  return { valid: true };
}

/**
 * Validates a git remote name (e.g. "origin", "upstream").
 */
export function validateRemoteName(name: string): ValidationResult {
  if (!name || name.trim().length === 0) {
    return { valid: false, reason: 'Remote name cannot be empty' };
  }
  if (name.startsWith('-')) {
    return { valid: false, reason: 'Remote name cannot start with a hyphen' };
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(name)) {
    return { valid: false, reason: 'Remote name contains invalid characters' };
  }
  return { valid: true };
}

/**
 * Validates a file path to be used in a git command.
 * Prevents path traversal and null-byte injection.
 */
export function validateFilePath(filePath: string): ValidationResult {
  if (!filePath || filePath.trim().length === 0) {
    return { valid: false, reason: 'File path cannot be empty' };
  }
  if (filePath.includes('\x00')) {
    return { valid: false, reason: 'File path cannot contain null bytes' };
  }
  // Prevent traversal above the repo root via absolute paths or ..
  if (filePath.startsWith('/') || filePath.startsWith('\\')) {
    return { valid: false, reason: 'File path must be relative, not absolute' };
  }
  // Normalize and check for traversal
  const normalized = filePath.replace(/\\/g, '/');
  const parts = normalized.split('/');
  let depth = 0;
  for (const part of parts) {
    if (part === '..') {
      depth--;
      if (depth < 0) return { valid: false, reason: 'Path traversal above repo root detected' };
    } else if (part !== '.') {
      depth++;
    }
  }
  return { valid: true };
}

/**
 * Validates a git ref (branch name, tag, or SHA).
 */
export function validateRef(ref: string): ValidationResult {
  if (!ref || ref.trim().length === 0) {
    return { valid: false, reason: 'Ref cannot be empty' };
  }
  if (ref.startsWith('-')) {
    return { valid: false, reason: 'Ref cannot start with a hyphen (flag injection risk)' };
  }
  if (ref.includes('\x00')) {
    return { valid: false, reason: 'Ref cannot contain null bytes' };
  }
  return { valid: true };
}

/**
 * Asserts a validation result and throws a descriptive Error on failure.
 * Intended for use in command handlers before calling repo functions.
 */
export function assertValid(result: ValidationResult, context: string): void {
  if (!result.valid) {
    throw new Error(`[git-smart-flow] ${context}: ${result.reason}`);
  }
}
