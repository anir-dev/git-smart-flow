import { Command } from 'commander';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const pkg = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf-8')) as {
  version: string;
};

const program = new Command();

program
  .name('git-smart-flow')
  .description('Interactive CLI to manage Git workflows guided, safe and smart')
  .version(pkg.version, '-v, --version', 'Show version number')
  .action(async () => {
    const { runMenu } = await import('./commands/menu.js');
    await runMenu();
  });

program
  .command('setup')
  .description('Interactive setup wizard')
  .action(async () => {
    const { runSetup } = await import('./commands/setup.js');
    await runSetup();
  });

program
  .command('menu')
  .description('Open interactive main menu')
  .action(async () => {
    const { runMenu } = await import('./commands/menu.js');
    await runMenu();
  });

program
  .command('branch')
  .description('Branch manager: create, switch, list, delete, rename')
  .action(async () => {
    const { runBranch } = await import('./commands/branch.js');
    await runBranch();
  });

program
  .command('commit')
  .description('Guided commit assistant')
  .action(async () => {
    const { runCommit } = await import('./commands/commit.js');
    await runCommit();
  });

program
  .command('commit-message')
  .description('Generate a commit message without committing')
  .option('--no-ai', 'Force heuristic provider (no AI)')
  .option('--show-prompt', 'Show AI prompt before sending')
  .option('--output-only', 'Print message to stdout only (for scripting)')
  .action(async (options) => {
    const { runCommitMessage } = await import('./commands/commit-message.js');
    await runCommitMessage(options);
  });

program
  .command('pr')
  .description('Generate PR title and description')
  .action(async () => {
    const { runPR } = await import('./commands/pr.js');
    await runPR();
  });

program
  .command('validate')
  .description('Validate repository state')
  .action(async () => {
    const { runValidate } = await import('./commands/validate.js');
    await runValidate();
  });

program
  .command('push')
  .description('Validated push with confirmation')
  .option('--dry-run', 'Preview push without executing')
  .option('--yes', 'Skip confirmation prompts')
  .action(async (opts: { dryRun?: boolean; yes?: boolean }) => {
    const { runPush } = await import('./commands/push.js');
    await runPush(opts);
  });

program
  .command('merge')
  .description('Assisted merge with conflict handling')
  .option('--dry-run', 'Preview merge without executing')
  .option('--yes', 'Skip confirmation prompts')
  .action(async (opts: { dryRun?: boolean; yes?: boolean }) => {
    const { runMerge } = await import('./commands/merge.js');
    await runMerge(opts);
  });

program
  .command('doctor')
  .description('Full environment diagnostic')
  .action(async () => {
    const { runDoctor } = await import('./commands/doctor.js');
    await runDoctor();
  });

program
  .command('config')
  .description('Edit global and local configuration')
  .action(async () => {
    const { runConfig } = await import('./commands/config.js');
    await runConfig();
  });

program
  .command('aliases')
  .description('Manage optional command aliases and hooks')
  .action(async () => {
    const { runAliases } = await import('./commands/aliases.js');
    await runAliases();
  });

program
  .command('install-hooks')
  .description('Install Git hooks in .git/hooks/')
  .action(async () => {
    const { runInstallHooks } = await import('./commands/install-hooks.js');
    await runInstallHooks();
  });

program
  .command('repo-init')
  .description('Repository setup wizard: branch, identity, .gitignore, remote, hooks, protection')
  .action(async () => {
    const { runRepoInit } = await import('./commands/repo-init.js');
    await runRepoInit();
  });

program
  .command('sync')
  .description('Fetch from remote, show ahead/behind status, pull or resolve conflicts')
  .action(async () => {
    const { runSync } = await import('./commands/sync.js');
    await runSync();
  });

program
  .command('revert')
  .description('Undo / revert wizard: remove bad files, reset commits, revert to remote…')
  .option('--dry-run', 'Preview undo operations without executing')
  .option('--yes', 'Skip confirmation prompts')
  .action(async (opts: { dryRun?: boolean; yes?: boolean }) => {
    const { runRevert } = await import('./commands/revert.js');
    await runRevert(opts);
  });

program
  .command('info')
  .description('Show current repository context')
  .action(async () => {
    const { runInfo } = await import('./commands/info.js');
    await runInfo();
  });

program
  .command('log')
  .description('Show commit history graph')
  .action(async () => {
    const { runLog } = await import('./commands/log.js');
    await runLog();
  });

program
  .command('stash')
  .description('Stash manager: save, list, apply, drop')
  .action(async () => {
    const { runStash } = await import('./commands/stash.js');
    await runStash();
  });

program.parse(process.argv);
