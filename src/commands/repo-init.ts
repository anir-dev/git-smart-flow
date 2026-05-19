import { existsSync, chmodSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';
import { getConfig, loadLocalConfig, saveLocalConfig } from '../config/config.js';
import {
  detectProjectType,
  getTemplate,
  hasGitignore,
  PROJECT_TYPE_LABELS,
  readGitignore,
  writeGitignore,
  type ProjectType,
} from '../git/gitignore.js';
import { runRemoteSetup } from '../git/remote-setup.js';
import {
  getCurrentBranch,
  getGitUserConfig,
  isGitRepo,
  setDefaultBranch,
  setGitUserConfig,
} from '../git/repo.js';
import { blank, divider, error, info, keyValue, section, success, warning } from '../ux/display.js';
import { confirmPrompt, inputPrompt, selectPrompt } from '../ux/prompt.js';

// ── Status helpers ─────────────────────────────────────────────────────────

function hooksInstalled(cwd: string): { commitMsg: boolean; prePush: boolean } {
  return {
    commitMsg: existsSync(join(cwd, '.git', 'hooks', 'commit-msg')),
    prePush: existsSync(join(cwd, '.git', 'hooks', 'pre-push')),
  };
}

function getRemotes(cwd: string): string[] {
  const r = spawnSync('git', ['remote'], { cwd, encoding: 'utf-8' });
  return r.status === 0 ? r.stdout.trim().split('\n').filter(Boolean) : [];
}

function isGhAvailable(): boolean {
  return spawnSync('gh', ['--version'], { encoding: 'utf-8' }).status === 0;
}

function isGhAuthenticated(): boolean {
  return spawnSync('gh', ['auth', 'status'], { encoding: 'utf-8' }).status === 0;
}

function fetchGithubIdentity(): { name: string; email: string } | null {
  if (!isGhAvailable() || !isGhAuthenticated()) return null;
  const name = spawnSync('gh', ['api', 'user', '--jq', '.name'], {
    encoding: 'utf-8',
  }).stdout?.trim();
  const email = spawnSync('gh', ['api', 'user', '--jq', '.email'], {
    encoding: 'utf-8',
  }).stdout?.trim();
  if (!name || name === 'null') return null;
  return { name, email: !email || email === 'null' ? '' : email };
}

// ── Status overview ────────────────────────────────────────────────────────

function printStatus(cwd: string): void {
  const config = getConfig();
  const identity = getGitUserConfig(cwd);
  const globalIdentity = getGitUserConfig();
  const branch = getCurrentBranch(cwd);
  const remotes = getRemotes(cwd);
  const hooks = hooksInstalled(cwd);
  const gitignorePresent = hasGitignore(cwd);
  const protected_ = config.git.protectedBranches;

  section('Current Repository Status');

  keyValue('Branch', branch);

  if (identity.name && identity.email) {
    success(`Identity (local): ${identity.name} <${identity.email}>`);
  } else if (globalIdentity.name && globalIdentity.email) {
    warning(`Identity: using global (${globalIdentity.name} <${globalIdentity.email}>)`);
  } else {
    error('Identity: not configured');
  }

  if (gitignorePresent) {
    success('.gitignore: present');
  } else {
    warning('.gitignore: missing');
  }

  if (remotes.length > 0) {
    success(`Remote(s): ${remotes.join(', ')}`);
  } else {
    warning('Remote: none configured');
  }

  const hooksOk = hooks.commitMsg && hooks.prePush;
  const hooksPartial = hooks.commitMsg || hooks.prePush;
  if (hooksOk) {
    success('Git hooks: commit-msg + pre-push installed');
  } else if (hooksPartial) {
    warning(
      `Git hooks: partial (commit-msg: ${hooks.commitMsg ? '✔' : '✘'}  pre-push: ${hooks.prePush ? '✔' : '✘'})`
    );
  } else {
    info('Git hooks: not installed');
  }

  success(`Protected branches (local): ${protected_.join(', ')}`);
  blank();
}

// ── Main command ───────────────────────────────────────────────────────────

export async function runRepoInit(): Promise<void> {
  const cwd = process.cwd();

  if (!isGitRepo(cwd)) {
    warning('Not a Git repository.');
    const init = await confirmPrompt('Initialize a Git repository here first?', true);
    if (!init) return;
    spawnSync('git', ['init'], { cwd });
    success('Git repository initialized.');
    blank();
  }

  section('Repository Setup Wizard');
  printStatus(cwd);

  let running = true;
  while (running) {
    const choice = await selectPrompt('What do you want to configure?', [
      'Configure Git identity',
      'Create / update .gitignore',
      'Set up remote repository',
      'Install Git hooks (commit-msg, pre-push)',
      'Configure protected branches',
      'Rename / set default branch',
      'Run all steps',
      'Done',
    ]);

    blank();

    switch (choice) {
      case 'Configure Git identity':
        await stepIdentity(cwd);
        break;
      case 'Create / update .gitignore':
        await stepGitignore(cwd);
        break;
      case 'Set up remote repository':
        await runRemoteSetup(cwd);
        break;
      case 'Install Git hooks (commit-msg, pre-push)':
        await stepHooks(cwd);
        break;
      case 'Configure protected branches':
        await stepProtectedBranches(cwd);
        break;
      case 'Rename / set default branch':
        await stepDefaultBranch(cwd);
        break;
      case 'Run all steps':
        await stepDefaultBranch(cwd);
        await stepIdentity(cwd);
        await stepGitignore(cwd);
        await runRemoteSetup(cwd);
        await stepHooks(cwd);
        await stepProtectedBranches(cwd);
        running = false;
        break;
      default:
        running = false;
    }

    if (running && choice !== 'Run all steps') {
      blank();
      printStatus(cwd);
    }
  }

  divider();
  success('Repository setup complete.');
  divider();
}

// ── Steps ──────────────────────────────────────────────────────────────────

async function stepDefaultBranch(cwd: string): Promise<void> {
  section('Default Branch Name');
  const current = getCurrentBranch(cwd);
  info(`Current branch: ${current}`);
  blank();

  const choice = await selectPrompt('Branch name:', [
    'main  (recommended)',
    'master',
    'develop',
    'Custom…',
    'Keep current — skip',
  ]);
  if (choice.startsWith('Keep')) return;

  let name = 'main';
  if (choice.startsWith('master')) name = 'master';
  else if (choice.startsWith('develop')) name = 'develop';
  else if (choice.startsWith('Custom')) {
    name = await inputPrompt('Branch name', current);
    if (!name.trim()) return;
    name = name.trim();
  }

  if (name === current) {
    info('Already on that branch name.');
    return;
  }

  setDefaultBranch(name, cwd);
  // Also try git branch -m for repos that already have commits
  spawnSync('git', ['branch', '-m', current, name], { cwd });
  success(`Branch renamed to "${name}".`);
  blank();
}

async function stepIdentity(cwd: string): Promise<void> {
  section('Git Identity');

  const local = getGitUserConfig(cwd);
  const global = getGitUserConfig();
  const ghIdentity = fetchGithubIdentity();

  if (local.name && local.email) {
    info(`Local identity: ${local.name} <${local.email}>`);
    const change = await confirmPrompt('Change it?', false);
    if (!change) return;
  }

  const options: string[] = [];

  if (ghIdentity) {
    const emailNote = ghIdentity.email
      ? ghIdentity.email
      : '(email private — will use GitHub noreply address)';
    options.push(`Use GitHub account: ${ghIdentity.name} <${emailNote}>`);
  }
  if (global.name && global.email) {
    options.push(`Use global git config: ${global.name} <${global.email}>`);
  }
  options.push('Enter manually');

  const choice =
    options.length === 1
      ? (options[0] ?? '')
      : await selectPrompt('Choose identity source:', options);

  let name = '';
  let email = '';

  if (choice.startsWith('Use GitHub account') && ghIdentity) {
    name = ghIdentity.name;
    if (ghIdentity.email) {
      email = ghIdentity.email;
    } else {
      // Fetch noreply email from GitHub
      const login = spawnSync('gh', ['api', 'user', '--jq', '.login'], {
        encoding: 'utf-8',
      }).stdout?.trim();
      const id = spawnSync('gh', ['api', 'user', '--jq', '.id'], {
        encoding: 'utf-8',
      }).stdout?.trim();
      if (login && id) {
        email = `${id}+${login}@users.noreply.github.com`;
        info(`Using GitHub noreply email: ${email}`);
      } else {
        email = await inputPrompt('Email (your email was private)', '');
      }
    }
  } else if (choice.startsWith('Use global git config') && global.name && global.email) {
    name = global.name;
    email = global.email;
  } else {
    name = await inputPrompt('Your name', global.name || '');
    email = await inputPrompt('Your email', global.email || '');
  }

  if (name.trim() && email.trim()) {
    setGitUserConfig(name.trim(), email.trim(), cwd);
    success(`Identity set: ${name.trim()} <${email.trim()}>`);
  } else {
    warning('Identity not changed.');
  }
  blank();
}

async function stepGitignore(cwd: string): Promise<void> {
  section('.gitignore');

  const detected = detectProjectType(cwd);
  const existing = hasGitignore(cwd);

  if (existing) {
    const current = readGitignore(cwd);
    info('.gitignore already exists.');
    console.log('\n  First lines:');
    current
      .split('\n')
      .slice(0, 8)
      .forEach((l) => console.log('  ' + l));
    blank();

    const action = await selectPrompt('What do you want to do?', [
      `Append ${PROJECT_TYPE_LABELS[detected]} template (detected)`,
      'Replace with a template',
      'Skip — keep as is',
    ]);
    if (action.startsWith('Skip')) return;

    if (action.startsWith('Append')) {
      const template = getTemplate(detected);
      writeGitignore(current.trimEnd() + '\n\n# --- git-smart-flow ---\n' + template, cwd);
      success('.gitignore updated.');
      return;
    }
    // Fall through to template selection below
  } else {
    info(`Detected project type: ${PROJECT_TYPE_LABELS[detected]}`);
  }

  const typeLabels: Array<{ key: ProjectType; label: string }> = [
    { key: detected, label: `${PROJECT_TYPE_LABELS[detected]} (detected)` },
    { key: 'node', label: 'Node.js / TypeScript / JavaScript' },
    { key: 'python', label: 'Python' },
    { key: 'java', label: 'Java / Kotlin (Maven / Gradle)' },
    { key: 'go', label: 'Go' },
    { key: 'rust', label: 'Rust' },
    { key: 'generic', label: 'Generic (editor files, env, logs)' },
    { key: 'generic', label: 'Skip' },
  ];

  const unique = typeLabels.filter((v, i, a) => a.findIndex((x) => x.label === v.label) === i);
  const labelStrings = unique.map((t) => t.label);
  const choice = await selectPrompt('Choose template:', labelStrings);

  if (choice === 'Skip') return;

  const matched = unique.find((t) => t.label === choice);
  const chosenType: ProjectType = matched?.key ?? detected;
  writeGitignore(getTemplate(chosenType), cwd);
  success(
    `.gitignore ${existing ? 'replaced' : 'created'} (${PROJECT_TYPE_LABELS[chosenType]} template).`
  );
  blank();
}

const COMMIT_MSG_HOOK = `#!/usr/bin/env bash
# git-smart-flow: commit-msg hook — validates Conventional Commits format
COMMIT_MSG=$(cat "$1")
if echo "$COMMIT_MSG" | grep -qE "^Merge "; then exit 0; fi
if ! echo "$COMMIT_MSG" | grep -qE "^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\\\\(.+\\\\))?!?: .+"; then
  echo "✘ Commit message does not follow Conventional Commits."
  echo "  Expected: <type>(<scope>): <description>"
  echo "  Example:  feat(auth): add login validation"
  exit 1
fi
exit 0
`;

const PRE_PUSH_HOOK = `#!/usr/bin/env bash
# git-smart-flow: pre-push hook — warns before pushing to protected branches
BRANCH=$(git symbolic-ref --short HEAD 2>/dev/null || git rev-parse --abbrev-ref HEAD)
PROTECTED="main master develop"
for P in $PROTECTED; do
  if [ "$BRANCH" = "$P" ]; then
    printf "\\n⚠  Pushing to protected branch: %s\\n" "$BRANCH"
    printf "Are you sure? [y/N] "
    read -r REPLY
    if [ "$REPLY" != "y" ] && [ "$REPLY" != "Y" ]; then
      echo "Push cancelled."
      exit 1
    fi
  fi
done
exit 0
`;

async function stepHooks(cwd: string): Promise<void> {
  section('Git Hooks');

  const hooks = hooksInstalled(cwd);
  info(`commit-msg hook: ${hooks.commitMsg ? 'installed ✔' : 'not installed'}`);
  info(`pre-push hook:   ${hooks.prePush ? 'installed ✔' : 'not installed'}`);
  blank();

  const choices: string[] = [];
  if (!hooks.commitMsg || !hooks.prePush) choices.push('Install all hooks');
  if (hooks.commitMsg || hooks.prePush) choices.push('Reinstall / overwrite all hooks');
  if (!hooks.commitMsg) choices.push('Install commit-msg only (validates Conventional Commits)');
  if (!hooks.prePush) choices.push('Install pre-push only (warns on protected branch push)');
  choices.push('Skip');

  const choice = await selectPrompt('Git hooks action:', choices);
  if (choice === 'Skip') return;

  const hooksDir = join(cwd, '.git', 'hooks');
  if (!existsSync(hooksDir)) mkdirSync(hooksDir, { recursive: true });

  const installCommitMsg = choice.includes('commit-msg') || choice.includes('all');
  const installPrePush = choice.includes('pre-push') || choice.includes('all');

  if (installCommitMsg) {
    const p = join(hooksDir, 'commit-msg');
    writeFileSync(p, COMMIT_MSG_HOOK, 'utf-8');
    chmodSync(p, '755');
    success('commit-msg hook installed.');
  }
  if (installPrePush) {
    const p = join(hooksDir, 'pre-push');
    writeFileSync(p, PRE_PUSH_HOOK, 'utf-8');
    chmodSync(p, '755');
    success('pre-push hook installed.');
  }
  blank();
  info('Hooks run automatically on commit and push.');
  info('To bypass in an emergency: git commit --no-verify');
  blank();
}

async function stepProtectedBranches(cwd: string): Promise<void> {
  section('Protected Branches (local gsf config)');

  const config = getConfig();
  const current = config.git.protectedBranches;
  info(`Currently protected: ${current.join(', ')}`);
  blank();
  info('gsf will warn and require confirmation before committing or pushing to these branches.');
  info(
    'Note: server-side branch protection rules must be set in your GitHub/GitLab repo settings.'
  );
  blank();

  const change = await confirmPrompt('Edit the protected branches list?', false);
  if (!change) return;

  const raw = await inputPrompt('Protected branches (comma-separated)', current.join(', '));
  const branches = raw
    .split(',')
    .map((b) => b.trim())
    .filter(Boolean);
  if (branches.length === 0) {
    info('No changes made.');
    return;
  }

  // Save to local config so it applies only to this repo
  const local = loadLocalConfig(cwd) ?? {};
  const updated = {
    ...local,
    git: {
      ...(local.git ?? {}),
      protectedBranches: branches,
    },
  };
  saveLocalConfig(updated, cwd);

  success(`Protected branches updated: ${branches.join(', ')}`);
  info('Saved to .git-smart-flow.json (local config for this repo).');
  blank();

  // Offer GitHub branch protection guidance
  const remotes = getRemotes(cwd);
  if (remotes.length > 0 && isGhAvailable() && isGhAuthenticated()) {
    const ghProtect = await confirmPrompt(
      'Also set branch protection rules on GitHub via gh CLI?',
      false
    );
    if (ghProtect) {
      setGitHubBranchProtection(cwd, branches);
    }
  } else if (remotes.length > 0) {
    blank();
    info('To add server-side branch protection on GitHub:');
    console.log(
      '  Settings → Branches → Add rule → enter branch name → enable "Require pull request reviews"'
    );
  }
}

function setGitHubBranchProtection(cwd: string, branches: string[]): void {
  // Detect repo from remote
  const remoteUrl = spawnSync('git', ['remote', 'get-url', 'origin'], {
    cwd,
    encoding: 'utf-8',
  }).stdout?.trim();
  if (!remoteUrl) {
    warning('Could not detect GitHub repo from origin remote.');
    return;
  }
  const match = remoteUrl.match(/github\.com[:/]([^/]+\/[^/.]+)/);
  if (!match) {
    warning('Origin does not look like a GitHub repository.');
    return;
  }
  const repo = match[1];

  for (const branch of branches) {
    info(`Setting protection for "${branch}" on ${repo}...`);
    const result = spawnSync(
      'gh',
      [
        'api',
        `repos/${repo}/branches/${branch}/protection`,
        '--method',
        'PUT',
        '--field',
        'required_status_checks=null',
        '--field',
        'enforce_admins=false',
        '--field',
        'required_pull_request_reviews[required_approving_review_count]=1',
        '--field',
        'restrictions=null',
      ],
      { cwd, encoding: 'utf-8' }
    );

    if (result.status === 0) {
      success(`Branch protection enabled for "${branch}" on GitHub.`);
    } else {
      warning(`Could not set protection for "${branch}" — branch may not exist on remote yet.`);
    }
  }
}
