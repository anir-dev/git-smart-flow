import { strict as assert } from 'assert';
import { describe, it } from 'node:test';
import { extractTicketFromBranch } from '../src/git/repo.js';

const PATTERN = '[A-Z][A-Z0-9]+-[0-9]+';

describe('branch-parser', () => {
  it('extracts ticket from feature branch', () => {
    assert.equal(extractTicketFromBranch('feature/PROJ-123-add-feature', PATTERN), 'PROJ-123');
  });

  it('extracts ticket from fix branch', () => {
    assert.equal(extractTicketFromBranch('fix/BUG-456-fix-null-pointer', PATTERN), 'BUG-456');
  });

  it('extracts ticket from hotfix branch', () => {
    assert.equal(extractTicketFromBranch('hotfix/CORE-99-prod-issue', PATTERN), 'CORE-99');
  });

  it('returns undefined for release branch without ticket', () => {
    assert.equal(extractTicketFromBranch('release/1.2.3', PATTERN), undefined);
  });

  it('returns undefined for chore branch without ticket', () => {
    assert.equal(extractTicketFromBranch('chore/update-deps', PATTERN), undefined);
  });

  it('extracts multi-letter project key', () => {
    assert.equal(extractTicketFromBranch('feature/MYAPP-1001-new-feature', PATTERN), 'MYAPP-1001');
  });

  it('returns undefined for main branch', () => {
    assert.equal(extractTicketFromBranch('main', PATTERN), undefined);
  });
});
