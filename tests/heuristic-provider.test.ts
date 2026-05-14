import { strict as assert } from 'assert';
import { describe, it } from 'node:test';
import { HeuristicProvider } from '../src/providers/heuristic.provider.js';
import type { AIContext, CommitConvention } from '../src/types/index.js';

const BASE_CONVENTION: CommitConvention = {
  type: 'conventional',
  allowedTypes: ['feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test', 'build', 'ci', 'chore', 'revert'],
  scopeRequired: false,
  maxHeaderLength: 100,
  requireTicket: 'auto',
  ticketPattern: '[A-Z][A-Z0-9]+-[0-9]+',
  subjectCase: 'lower-case',
  hasCommitlint: false,
  hasHusky: false,
};

function makeContext(files: Array<{ path: string; status: string }>): AIContext {
  return {
    repository: 'test-repo',
    branch: 'feature/PROJ-123-test',
    ticket: 'PROJ-123',
    detectedCommitConvention: BASE_CONVENTION,
    changedFiles: files,
    localSummary: [],
    sanitizedFragments: [],
  };
}

describe('heuristic-provider', () => {
  const provider = new HeuristicProvider();

  it('is always available', async () => {
    assert.equal(await provider.isAvailable(), true);
  });

  it('generates a conventional commit message', async () => {
    const ctx = makeContext([{ path: 'src/auth/login.ts', status: 'modified' }]);
    const msg = await provider.generateCommitMessage(ctx);
    assert.match(msg, /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\(.+\))?!?: .+/);
  });

  it('generates a test type for test files', async () => {
    const ctx = makeContext([{ path: 'tests/auth.test.ts', status: 'added' }]);
    const msg = await provider.generateCommitMessage(ctx);
    assert.ok(msg.startsWith('test'), `Expected test type, got: ${msg}`);
  });

  it('generates a docs type for markdown files', async () => {
    const ctx = makeContext([{ path: 'docs/usage.md', status: 'modified' }]);
    const msg = await provider.generateCommitMessage(ctx);
    assert.ok(msg.startsWith('docs'), `Expected docs type, got: ${msg}`);
  });

  it('generates a ci type for workflow files', async () => {
    const ctx = makeContext([{ path: '.github/workflows/ci.yml', status: 'modified' }]);
    const msg = await provider.generateCommitMessage(ctx);
    assert.ok(msg.startsWith('ci') || msg.startsWith('chore'), `Got: ${msg}`);
  });

  it('respects max header length', async () => {
    const ctx = makeContext(
      Array.from({ length: 10 }, (_, i) => ({ path: `src/module-${i}/component-${i}-very-long-name.ts`, status: 'modified' }))
    );
    const msg = await provider.generateCommitMessage(ctx);
    assert.ok(msg.length <= BASE_CONVENTION.maxHeaderLength, `Message too long: ${msg.length}`);
  });

  it('generates a PR description', async () => {
    const ctx = makeContext([{ path: 'src/auth.ts', status: 'modified' }]);
    const pr = await provider.generatePRDescription(ctx);
    assert.ok(pr.title.length > 0);
    assert.ok(pr.body.includes('## Changes'));
  });
});
