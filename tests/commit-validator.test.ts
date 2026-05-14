import { strict as assert } from 'assert';
import { describe, it } from 'node:test';

function validateCommitMessage(
  message: string,
  allowedTypes: string[],
  maxHeaderLength: number
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const regex = /^([a-z]+)(\([^)]+\))?!?: .+/;
  const match = message.match(regex);

  if (!match) {
    errors.push('Message does not follow Conventional Commits format: <type>(<scope>): <subject>');
    return { valid: false, errors };
  }

  const type = match[1];
  if (!allowedTypes.includes(type)) {
    errors.push(`Type "${type}" is not allowed. Allowed: ${allowedTypes.join(', ')}`);
  }

  if (message.length > maxHeaderLength) {
    errors.push(`Message exceeds max length: ${message.length}/${maxHeaderLength}`);
  }

  return { valid: errors.length === 0, errors };
}

const TYPES = ['feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test', 'build', 'ci', 'chore', 'revert'];

describe('commit-validator', () => {
  it('validates a correct conventional commit', () => {
    const result = validateCommitMessage('feat(auth): add login validation', TYPES, 100);
    assert.equal(result.valid, true);
    assert.deepEqual(result.errors, []);
  });

  it('validates commit without scope', () => {
    const result = validateCommitMessage('fix: resolve null pointer exception', TYPES, 100);
    assert.equal(result.valid, true);
  });

  it('rejects unknown type', () => {
    const result = validateCommitMessage('update: something', TYPES, 100);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('not allowed')));
  });

  it('rejects message without colon', () => {
    const result = validateCommitMessage('feat add login', TYPES, 100);
    assert.equal(result.valid, false);
  });

  it('rejects message over max length', () => {
    const long = 'feat: ' + 'a'.repeat(100);
    const result = validateCommitMessage(long, TYPES, 72);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('max length')));
  });

  it('validates breaking change with !', () => {
    const result = validateCommitMessage('feat(api)!: remove deprecated endpoint', TYPES, 100);
    assert.equal(result.valid, true);
  });
});
