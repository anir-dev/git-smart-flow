import { Command } from 'commander';
import { readFileSync } from 'fs';
import { join } from 'path';

const pkg = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf-8'));

const program = new Command();

program
  .name('git-smart-flow')
  .description('Interactive CLI to manage Git workflows guided, safe and smart')
  .version(pkg.version, '-v, --version', 'Show version number')
  .action(async () => {
    // Default: open the interactive menu when no subcommand is given
    const { runMenu } = await import('./commands/menu');
    await runMenu();
  });

program
  .command('setup')
  .description('Interactive setup wizard')
  .action(async () => {
    const { runSetup } = await import('./commands/setup');
    await runSetup();
  });

program
  .command('menu')
  .description('Open interactive main menu')
  .action(async () => {
    const { runMenu } = await import('./commands/menu');
    await runMenu();
  });

program
  .command('branch')
  .description('Branch manager: create, switch, list, delete, rename')
  .action(async () => {
    const { runBranch } = await import('./commands/branch');
    await runBranch();
  });

program
  .command('commit')
  .description('Guided commit assistant')
  .action(async () => {
    const { runCommit } = await import('./commands/commit');
    await runCommit();
  });

program
  .command('commit-message')
  .description('Generate a commit message without committing')
  .option('--no-ai', 'Force heuristic provider (no AI)')
  .option('--show-prompt', 'Show AI prompt before sending')
  .option('--output-only', 'Print message to stdout only (for scripting)')
  .action(async (options) => {
    const { runCommitMessage } = await import('./commands/commit-message');
    await runCommitMessage(options);
  });

program
  .command('pr')
  .description('Generate PR title and description')
  .action(async () => {
    const { runPR } = await import('./commands/pr');
    await runPR();
  });

program
  .command('validate')
  .description('Validate repository state')
  .action(async () => {
    const { runValidate } = await import('./commands/validate');
    await runValidate();
  });

program
  .command('push')
  .description('Validated push with confirmation')
  .action(async () => {
    const { runPush } = await import('./commands/push');
    await runPush();
  });

program
  .command('merge')
  .description('Assisted merge with conflict handling')
  .action(async () => {
    const { runMerge } = await import('./commands/merge');
    await runMerge();
  });

program
  .command('doctor')
  .description('Full environment diagnostic')
  .action(async () => {
    const { runDoctor } = await import('./commands/doctor');
    await runDoctor();
  });

program
  .command('config')
  .description('Edit global and local configuration')
  .action(async () => {
    const { runConfig } = await import('./commands/config');
    await runConfig();
  });

program
  .command('aliases')
  .description('Manage optional command aliases and hooks')
  .action(async () => {
    const { runAliases } = await import('./commands/aliases');
    await runAliases();
  });

program
  .command('install-hooks')
  .description('Install Git hooks in .git/hooks/')
  .action(async () => {
    const { runInstallHooks } = await import('./commands/install-hooks');
    await runInstallHooks();
  });

program
  .command('repo-init')
  .description('Repository setup wizard: branch, identity, .gitignore, remote, hooks, protection')
  .action(async () => {
    const { runRepoInit } = await import('./commands/repo-init');
    await runRepoInit();
  });

program
  .command('info')
  .description('Show current repository context')
  .action(async () => {
    const { runInfo } = await import('./commands/info');
    await runInfo();
  });

program.parse(process.argv);
