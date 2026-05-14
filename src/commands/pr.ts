import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { getConfig } from '../config/config.js';
import { buildAIContext } from '../git/ai-context-builder.js';
import { detectConvention } from '../git/convention-detector.js';
import { ensureGitRepo } from '../git/ensure-repo.js';
import {
  extractTicketFromBranch,
  getCurrentBranch,
  getCommitsSinceBase,
  getRepoName,
  getStagedFiles,
} from '../git/repo.js';
import { createProviderWithFallback } from '../providers/provider.factory.js';
import { blank, error, info, keyValue, section, success } from '../ux/display.js';
import { confirmPrompt, inputPrompt, selectPrompt } from '../ux/prompt.js';
import { failSpinner, startSpinner, succeedSpinner } from '../ux/spinner.js';

const DEFAULT_TEMPLATE = `## Context
<!-- Why is this change needed? -->

## Changes
<!-- What has been changed? -->

## Testing
<!-- How has this been tested? -->

## Risks / Impact
<!-- Any risks or impacts? -->

## Additional Notes
<!-- Any other relevant information? -->
`;

export async function runPR(): Promise<void> {
  const cwd = process.cwd();

  if (!await ensureGitRepo(cwd)) return;

  const config = getConfig();
  const convention = await detectConvention(cwd);
  const branch = getCurrentBranch(cwd);
  const repoName = getRepoName(cwd);
  const ticket = extractTicketFromBranch(branch, config.commit.ticketPattern);

  // Detect base branch
  let base = config.git.defaultBaseBranches[0] ?? 'main';
  const basePick = await selectPrompt(
    `Base branch for PR (current: ${base}):`,
    [...config.git.defaultBaseBranches, 'Enter manually']
  );
  if (basePick === 'Enter manually') {
    base = await inputPrompt('Base branch');
  } else {
    base = basePick;
  }

  const commits = getCommitsSinceBase(base, cwd);
  const staged = getStagedFiles(cwd);

  // Read PR template
  const templatePaths = [
    join(cwd, '.github/pull_request_template.md'),
    join(cwd, '.github/PULL_REQUEST_TEMPLATE.md'),
    join(cwd, '.gitlab/merge_request_templates/Default.md'),
  ];
  const templateContent = templatePaths.reduce<string | null>((found, p) => {
    if (found) return found;
    return existsSync(p) ? readFileSync(p, 'utf-8') : null;
  }, null) ?? DEFAULT_TEMPLATE;

  const aiContext = buildAIContext({
    repoName, branch, ticket, convention, stagedFiles: staged,
    allowRawDiff: config.ai.allowRawDiff,
  });

  const provider = await createProviderWithFallback(config);
  startSpinner(`Generating PR description with ${provider.name}...`);

  let proposal;
  try {
    proposal = await provider.generatePRDescription(aiContext);
    succeedSpinner();
  } catch {
    failSpinner();
    proposal = { title: branch, body: templateContent };
  }

  section('PR Title');
  console.log(`\n  ${proposal.title}\n`);

  section('PR Body');
  console.log('\n' + proposal.body);

  blank();
  keyValue('Commits since base', String(commits.length));
  keyValue('Provider', provider.name);
  blank();

  const action = await selectPrompt('What do you want to do?', [
    'Copy to clipboard',
    'Save to pr-description.md',
    'Print to terminal',
    'Done',
  ]);

  const fullContent = `# ${proposal.title}\n\n${proposal.body}`;

  if (action === 'Copy to clipboard') {
    try {
      const { default: clipboardy } = await import('clipboardy');
      await clipboardy.write(fullContent);
      success('Copied to clipboard.');
    } catch {
      error('Failed to copy to clipboard.');
    }
  } else if (action === 'Save to pr-description.md') {
    writeFileSync(join(cwd, 'pr-description.md'), fullContent, 'utf-8');
    success('Saved to pr-description.md');
  } else if (action === 'Print to terminal') {
    console.log('\n' + fullContent);
  }
}
