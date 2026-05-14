import { getConfig } from '../config/config.js';
import { buildAIContext } from '../git/ai-context-builder.js';
import { detectConvention } from '../git/convention-detector.js';
import { ensureGitRepo } from '../git/ensure-repo.js';
import {
  extractTicketFromBranch,
  getCurrentBranch,
  getRepoName,
  getStagedFiles,
  isGitRepo,
} from '../git/repo.js';
import { scanFiles } from '../security/scanner.js';
import { createProviderWithFallback } from '../providers/provider.factory.js';
import { HeuristicProvider } from '../providers/heuristic.provider.js';
import { blank, error, info, keyValue, section, warning } from '../ux/display.js';
import { confirmPrompt } from '../ux/prompt.js';
import { startSpinner, succeedSpinner, failSpinner } from '../ux/spinner.js';
import { guidedMessageBuilder } from './commit.js';

export interface CommitMessageOptions {
  ai?: boolean;
  showPrompt?: boolean;
  outputOnly?: boolean;
}

export async function runCommitMessage(options: CommitMessageOptions = {}): Promise<void> {
  const cwd = process.cwd();
  const forceHeuristic = options.ai === false;
  const outputOnly = options.outputOnly === true;

  if (!isGitRepo(cwd)) {
    if (outputOnly) { process.stdout.write('chore: update files\n'); return; }
    if (!await ensureGitRepo(cwd)) return;
  }

  const config = getConfig();
  const convention = await detectConvention(cwd);
  const branch = getCurrentBranch(cwd);
  const repoName = getRepoName(cwd);
  const staged = getStagedFiles(cwd);
  const ticket = extractTicketFromBranch(branch, config.commit.ticketPattern);

  if (staged.length === 0 && !outputOnly) {
    warning('No staged files found.');
    const manual = await confirmPrompt('Build message manually with guided builder?', true);
    if (manual) {
      const built = await guidedMessageBuilder();
      if (built) {
        section('Commit Message');
        console.log('\n  ' + built.split('\n').join('\n  ') + '\n');
      }
      return;
    }
    info('Stage files with "git add <file>" before generating a commit message.');
    return;
  }

  const scanResult = scanFiles(
    staged.map((f) => ({ path: f.path })),
    config.security.blockedFiles
  );

  if (!scanResult.clean && config.security.blockOnSecrets) {
    if (outputOnly) { process.stdout.write('chore: update files\n'); return; }
    error('Security issues detected: ' + scanResult.summary);
    process.exit(1);
  }

  const aiContext = buildAIContext({
    repoName, branch, ticket, convention, stagedFiles: staged,
    allowRawDiff: config.ai.allowRawDiff,
  });

  if (options.showPrompt && !outputOnly) {
    section('AI Context (what will be sent)');
    console.log(JSON.stringify(aiContext, null, 2));
    blank();
  }

  const provider = forceHeuristic
    ? new HeuristicProvider()
    : await createProviderWithFallback(config);

  if (!outputOnly) {
    startSpinner(`Generating commit message with ${provider.name}...`);
  }

  let message: string;
  try {
    message = await provider.generateCommitMessage(aiContext);
    if (!outputOnly) succeedSpinner(`Generated with ${provider.name}`);
  } catch (e) {
    if (!outputOnly) failSpinner('Generation failed');
    message = 'chore: update files';
  }

  if (outputOnly) {
    process.stdout.write(message + '\n');
    return;
  }

  section('Proposed Commit Message');
  console.log('\n  ' + message + '\n');
  keyValue('Provider', provider.name);
  if (ticket) keyValue('Ticket', ticket);
  blank();
}
