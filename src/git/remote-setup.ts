import { spawnSync } from 'child_process';
import { basename } from 'path';
import { blank, info, section, success, warning } from '../ux/display.js';
import { confirmPrompt, inputPrompt, selectPrompt } from '../ux/prompt.js';

function isGhAvailable(): boolean {
  return spawnSync('gh', ['--version'], { encoding: 'utf-8' }).status === 0;
}

function isGhAuthenticated(): boolean {
  return spawnSync('gh', ['auth', 'status'], { encoding: 'utf-8' }).status === 0;
}

function gitRemoteAdd(name: string, url: string, cwd: string): boolean {
  return spawnSync('git', ['remote', 'add', name, url], { cwd, encoding: 'utf-8' }).status === 0;
}

function getExistingRemotes(cwd: string): string[] {
  const r = spawnSync('git', ['remote'], { cwd, encoding: 'utf-8' });
  return r.status === 0 ? r.stdout.trim().split('\n').filter(Boolean) : [];
}

export async function runRemoteSetup(cwd = process.cwd()): Promise<void> {
  section('Remote Repository');

  const existingRemotes = getExistingRemotes(cwd);
  if (existingRemotes.length > 0) {
    info(`Remote already configured: ${existingRemotes.join(', ')}`);
    const reconfigure = await confirmPrompt('Do you want to add another remote?', false);
    if (!reconfigure) return;
  }

  const ghAvailable = isGhAvailable();
  const ghAuth = ghAvailable && isGhAuthenticated();

  const options: string[] = [];
  if (ghAvailable && ghAuth) {
    options.push('Create new GitHub repository (gh CLI — authenticated)');
  } else if (ghAvailable) {
    options.push('Create new GitHub repository (gh CLI — need to login first)');
  }
  options.push('Enter remote URL manually (GitHub, GitLab, Bitbucket, self-hosted...)');
  options.push('Skip for now — I will add the remote later');

  const choice = await selectPrompt('How do you want to connect to a remote?', options);

  if (choice.startsWith('Skip')) {
    blank();
    info('No remote configured. Add it later with:');
    console.log('  git remote add origin <URL>');
    console.log('  gsf push');
    blank();
    return;
  }

  if (choice.startsWith('Create new GitHub') && ghAvailable) {
    if (!ghAuth) {
      warning('You need to authenticate with GitHub first.');
      info('Run the following command in your terminal, then come back:');
      console.log('\n  gh auth login\n');
      const retry = await confirmPrompt('Have you logged in? Try creating the repo now?', false);
      if (!retry) return;
    }
    await createGitHubRepo(cwd);
    return;
  }

  // Manual URL
  await enterRemoteManually(cwd);
}

async function createGitHubRepo(cwd: string): Promise<void> {
  const dirName = basename(cwd);
  const repoName = await inputPrompt('Repository name', dirName);
  if (!repoName.trim()) {
    info('Cancelled.');
    return;
  }

  const visibility = await selectPrompt('Visibility:', ['private', 'public']);
  const description = await inputPrompt('Description (optional, press Enter to skip)', '');

  blank();
  info(`Creating "${repoName}" on GitHub...`);

  const args = [
    'repo',
    'create',
    repoName.trim(),
    `--${visibility}`,
    '--source=.',
    '--remote=origin',
    '--push=false',
  ];
  if (description.trim()) args.push('--description', description.trim());

  const result = spawnSync('gh', args, { cwd, encoding: 'utf-8' });

  if (result.status === 0) {
    const url = result.stdout.trim() || `https://github.com/<user>/${repoName.trim()}`;
    success(`Repository "${repoName.trim()}" created and "origin" remote configured.`);
    info(`Remote URL: ${url}`);
    blank();
    info('Your first push:');
    console.log('  gsf push');
  } else {
    warning('Could not create repository automatically.');
    if (result.stderr) console.log('\n' + result.stderr.trim());
    blank();
    info('Create it manually at https://github.com/new, then run:');
    console.log('  git remote add origin <URL>');
    console.log('  gsf push');
  }
}

async function enterRemoteManually(cwd: string): Promise<void> {
  blank();
  info('Steps to get your remote URL:');
  console.log('  GitHub  → https://github.com/new');
  console.log('  GitLab  → https://gitlab.com/projects/new');
  console.log('  Create the repository there (empty, no README), then copy the clone URL.');
  blank();

  const url = await inputPrompt('Remote URL (SSH or HTTPS)');
  if (!url.trim()) {
    info('Skipped — no URL provided.');
    return;
  }

  const remoteName = await inputPrompt('Remote name', 'origin');
  const name = remoteName.trim() || 'origin';

  const ok = gitRemoteAdd(name, url.trim(), cwd);
  if (ok) {
    success(`Remote "${name}" set to: ${url.trim()}`);
    blank();
    info('Your first push:');
    console.log('  gsf push');
  } else {
    warning(`Could not add remote "${name}". It may already exist.`);
    info('Check existing remotes with: git remote -v');
  }
}
