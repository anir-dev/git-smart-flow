import { strict as assert } from 'assert';
import { describe, it } from 'node:test';
import { buildAIContext } from '../src/git/ai-context-builder.js';
import type { CommitConvention, StagedFile } from '../src/types/index.js';

const CONVENTION: CommitConvention = {
  type: 'conventional',
  allowedTypes: ['feat', 'fix', 'chore'],
  scopeRequired: false,
  maxHeaderLength: 100,
  requireTicket: 'auto',
  ticketPattern: '[A-Z][A-Z0-9]+-[0-9]+',
  subjectCase: 'lower-case',
  hasCommitlint: false,
  hasHusky: false,
};

const STAGED: StagedFile[] = [
  { path: 'src/auth/login.ts', status: 'modified' },
  { path: 'tests/auth.test.ts', status: 'added' },
];

describe('ai-context-builder', () => {
  it('builds context without raw diff by default', () => {
    const ctx = buildAIContext({
      repoName: 'my-app',
      branch: 'feature/AUTH-1-login',
      ticket: 'AUTH-1',
      convention: CONVENTION,
      stagedFiles: STAGED,
      diff: 'diff --git a/src/auth/login.ts ...\n+const secret="abc123"',
      allowRawDiff: false,
    });

    assert.equal(ctx.repository, 'my-app');
    assert.equal(ctx.branch, 'feature/AUTH-1-login');
    assert.equal(ctx.ticket, 'AUTH-1');
    assert.equal(ctx.changedFiles.length, 2);
    // Raw diff should NOT appear in sanitizedFragments
    for (const frag of ctx.sanitizedFragments) {
      assert.ok(!frag.summary.includes('secret="abc123"'), 'Raw secret should not be in context');
    }
  });

  it('includes raw diff when allowRawDiff is true', () => {
    const ctx = buildAIContext({
      repoName: 'my-app',
      branch: 'main',
      convention: CONVENTION,
      stagedFiles: STAGED,
      diff: 'diff --git a/src/auth/login.ts b/src/auth/login.ts\n+++ b/src/auth/login.ts\n+const x = 1;',
      allowRawDiff: true,
    });

    const hasDiffContent = ctx.sanitizedFragments.some((f) => f.summary.includes('+'));
    assert.ok(hasDiffContent);
  });

  it('includes localSummary with file statuses', () => {
    const ctx = buildAIContext({
      repoName: 'my-app',
      branch: 'main',
      convention: CONVENTION,
      stagedFiles: STAGED,
    });

    assert.ok(ctx.localSummary.length > 0);
    assert.ok(ctx.localSummary.some((s) => s.includes('Modified') || s.includes('Added')));
  });

  it('builds context with empty staged files', () => {
    const ctx = buildAIContext({
      repoName: 'my-app',
      branch: 'main',
      convention: CONVENTION,
      stagedFiles: [],
    });
    assert.equal(ctx.changedFiles.length, 0);
    assert.equal(ctx.sanitizedFragments.length, 0);
  });
});
