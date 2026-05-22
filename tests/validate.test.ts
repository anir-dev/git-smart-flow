import { strict as assert } from 'assert';
import { describe, it } from 'node:test';
import {
  validateBranchName,
  validateRemoteName,
  validateFilePath,
  validateRef,
  assertValid,
} from '../src/git/validate.js';

describe('validate', () => {
  // ── validateBranchName ────────────────────────────────────────────────────

  describe('validateBranchName', () => {
    it('accepts a simple branch name', () => {
      assert.ok(validateBranchName('feat/add-login').valid);
    });

    it('accepts branch with ticket', () => {
      assert.ok(validateBranchName('feat/PROJ-123-add-login').valid);
    });

    it('rejects empty string', () => {
      const r = validateBranchName('');
      assert.ok(!r.valid);
      assert.ok(r.reason);
    });

    it('rejects whitespace-only string', () => {
      assert.ok(!validateBranchName('   ').valid);
    });

    it('rejects branch starting with hyphen (flag injection)', () => {
      const r = validateBranchName('--upload-pack=evil');
      assert.ok(!r.valid);
      assert.match(r.reason!, /hyphen/);
    });

    it('rejects branch with consecutive dots', () => {
      assert.ok(!validateBranchName('feat..broken').valid);
    });

    it('rejects branch starting with dot', () => {
      assert.ok(!validateBranchName('.hidden').valid);
    });

    it('rejects branch ending with dot', () => {
      assert.ok(!validateBranchName('feat/broken.').valid);
    });

    it('rejects branch with whitespace', () => {
      assert.ok(!validateBranchName('feat/my branch').valid);
    });

    it('rejects branch with tilde', () => {
      assert.ok(!validateBranchName('feat~1').valid);
    });

    it('rejects branch ending with .lock', () => {
      assert.ok(!validateBranchName('feat/foo.lock').valid);
    });

    it('rejects branch with @{', () => {
      assert.ok(!validateBranchName('feat@{1}').valid);
    });

    it('rejects branch ending with slash', () => {
      assert.ok(!validateBranchName('feat/').valid);
    });

    it('rejects branch with consecutive slashes', () => {
      assert.ok(!validateBranchName('feat//broken').valid);
    });

    it('rejects branch with null byte', () => {
      assert.ok(!validateBranchName('feat/\x00evil').valid);
    });

    it('rejects branch exceeding max length', () => {
      assert.ok(!validateBranchName('a'.repeat(251)).valid);
    });
  });

  // ── validateRemoteName ────────────────────────────────────────────────────

  describe('validateRemoteName', () => {
    it('accepts "origin"', () => {
      assert.ok(validateRemoteName('origin').valid);
    });

    it('accepts "upstream"', () => {
      assert.ok(validateRemoteName('upstream').valid);
    });

    it('accepts remote with dots and hyphens', () => {
      assert.ok(validateRemoteName('my-remote.org').valid);
    });

    it('rejects empty string', () => {
      assert.ok(!validateRemoteName('').valid);
    });

    it('rejects remote starting with hyphen', () => {
      assert.ok(!validateRemoteName('-bad').valid);
    });

    it('rejects remote with special characters', () => {
      assert.ok(!validateRemoteName('origin;evil').valid);
    });

    it('rejects remote with spaces', () => {
      assert.ok(!validateRemoteName('my remote').valid);
    });
  });

  // ── validateFilePath ──────────────────────────────────────────────────────

  describe('validateFilePath', () => {
    it('accepts a relative path', () => {
      assert.ok(validateFilePath('src/index.ts').valid);
    });

    it('accepts a nested relative path', () => {
      assert.ok(validateFilePath('a/b/c/file.txt').valid);
    });

    it('rejects empty string', () => {
      assert.ok(!validateFilePath('').valid);
    });

    it('rejects absolute path', () => {
      const r = validateFilePath('/etc/passwd');
      assert.ok(!r.valid);
      assert.match(r.reason!, /absolute/);
    });

    it('rejects path with null byte', () => {
      assert.ok(!validateFilePath('foo\x00bar').valid);
    });

    it('rejects path traversal above root', () => {
      const r = validateFilePath('../../etc/passwd');
      assert.ok(!r.valid);
      assert.match(r.reason!, /traversal/);
    });

    it('accepts single dot path', () => {
      assert.ok(validateFilePath('./src/file.ts').valid);
    });
  });

  // ── validateRef ───────────────────────────────────────────────────────────

  describe('validateRef', () => {
    it('accepts a branch name ref', () => {
      assert.ok(validateRef('main').valid);
    });

    it('accepts a full SHA', () => {
      assert.ok(validateRef('abc1234def5678901234567890123456789012345').valid);
    });

    it('accepts a tag ref', () => {
      assert.ok(validateRef('v1.0.0').valid);
    });

    it('rejects empty string', () => {
      assert.ok(!validateRef('').valid);
    });

    it('rejects ref starting with hyphen (flag injection)', () => {
      const r = validateRef('--exec=evil');
      assert.ok(!r.valid);
      assert.match(r.reason!, /hyphen/);
    });

    it('rejects ref with null byte', () => {
      assert.ok(!validateRef('main\x00evil').valid);
    });
  });

  // ── assertValid ───────────────────────────────────────────────────────────

  describe('assertValid', () => {
    it('does not throw for valid result', () => {
      assert.doesNotThrow(() => assertValid({ valid: true }, 'test'));
    });

    it('throws with context and reason for invalid result', () => {
      assert.throws(
        () => assertValid({ valid: false, reason: 'too short' }, 'branch name'),
        (err: Error) => {
          assert.ok(err.message.includes('branch name'));
          assert.ok(err.message.includes('too short'));
          return true;
        }
      );
    });
  });
});
