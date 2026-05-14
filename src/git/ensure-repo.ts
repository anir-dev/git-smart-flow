import { basename } from 'path';
import {
  getGitUserConfig,
  initRepo,
  isGitRepo,
  setDefaultBranch,
  setGitUserConfig,
} from './repo.js';
import {
  detectProjectType,
  getTemplate,
  hasGitignore,
  PROJECT_TYPE_LABELS,
  readGitignore,
  writeGitignore,
} from './gitignore.js';
import { runRemoteSetup } from './remote-setup.js';
import { blank, divider, info, section, success, warning } from '../ux/display.js';
import { confirmPrompt, inputPrompt, selectPrompt } from '../ux/prompt.js';

/**
 * Ensures the cwd is a Git repository.
 * If not, runs the full interactive onboarding wizard and returns true when ready.
 * Returns false if the user declined to initialize.
 */
export async function ensureGitRepo(cwd = process.cwd()): Promise<boolean> {
  if (isGitRepo(cwd)) return true;

  const dirName = basename(cwd);
  warning(`"${dirName}" is not a Git repository.`);
  blank();

  const init = await confirmPrompt('Initialize a Git repository here?', true);
  if (!init) {
    info('No Git repository initialized. Exiting.');
    return false;
  }

  initRepo(cwd);
  success(`Initialized empty Git repository in ${cwd}/.git/`);
  blank();

  await wizardDefaultBranch(cwd);
  await wizardGitIdentity(cwd);
  await wizardGitignore(cwd);
  await runRemoteSetup(cwd);

  blank();
  divider();
  success('Repository is ready. You can now stage files and make your first commit.');
  divider();
  blank();

  return true;
}

// ── Step 1: Default branch name ────────────────────────────────────────────

async function wizardDefaultBranch(cwd: string): Promise<void> {
  section('Default Branch Name');

  const choice = await selectPrompt(
    'Choose the default branch name:',
    ['main  (recommended)', 'master', 'develop', 'Custom…']
  );

  let branchName = 'main';
  if (choice.startsWith('master')) branchName = 'master';
  else if (choice.startsWith('develop')) branchName = 'develop';
  else if (choice.startsWith('Custom')) {
    branchName = await inputPrompt('Branch name', 'main');
    if (!branchName.trim()) branchName = 'main';
  }

  setDefaultBranch(branchName.trim(), cwd);
  success(`Default branch set to "${branchName.trim()}".`);
  blank();
}

// ── Step 2: Git identity ────────────────────────────────────────────────────

async function wizardGitIdentity(cwd: string): Promise<void> {
  const local = getGitUserConfig(cwd);
  if (local.name && local.email) return; // already configured locally

  section('Git Identity');
  info('Git needs a name and email to create commits.');

  const global = getGitUserConfig(); // global config (no cwd)

  if (global.name && global.email) {
    const useGlobal = await confirmPrompt(
      `Use global identity "${global.name} <${global.email}>"?`,
      true
    );
    if (useGlobal) {
      success(`Using global identity: ${global.name} <${global.email}>`);
      blank();
      return;
    }
  }

  const name = await inputPrompt('Your name', global.name || '');
  const email = await inputPrompt('Your email', global.email || '');

  if (name.trim() && email.trim()) {
    setGitUserConfig(name.trim(), email.trim(), cwd);
    success(`Git identity set: ${name.trim()} <${email.trim()}>`);
  } else {
    warning('Identity not set — you can configure it later with:\n  git config user.name "Your Name"\n  git config user.email "you@example.com"');
  }
  blank();
}

// ── Step 3: .gitignore ─────────────────────────────────────────────────────

async function wizardGitignore(cwd: string): Promise<void> {
  section('.gitignore');

  const detected = detectProjectType(cwd);
  const detectedLabel = PROJECT_TYPE_LABELS[detected];

  if (hasGitignore(cwd)) {
    info('.gitignore already exists.');
    const append = await confirmPrompt(`Append recommended ${detectedLabel} entries?`, false);
    if (!append) { blank(); return; }
    const existing = readGitignore(cwd);
    const template = getTemplate(detected);
    writeGitignore(existing + '\n# --- Added by git-smart-flow ---\n' + template, cwd);
    success('.gitignore updated.');
    blank();
    return;
  }

  info(`Detected project type: ${detectedLabel}`);

  const typeOptions = [
    `${detectedLabel} (detected)`,
    'Node.js / TypeScript / JavaScript',
    'Python',
    'Java / Kotlin (Maven / Gradle)',
    'Go',
    'Rust',
    'Generic (editor files, env, logs)',
    'Skip — I will create it manually',
  ];

  const typeChoice = await selectPrompt('Choose .gitignore template:', typeOptions);

  if (typeChoice.startsWith('Skip')) {
    info('Skipped — create .gitignore manually or run "gsf setup" later.');
    blank();
    return;
  }

  // Resolve chosen type from label
  let chosenType = detected;
  if (typeChoice.includes('Node.js'))   chosenType = 'node';
  else if (typeChoice.includes('Python'))  chosenType = 'python';
  else if (typeChoice.includes('Java'))    chosenType = 'java';
  else if (typeChoice.includes('Go'))      chosenType = 'go';
  else if (typeChoice.includes('Rust'))    chosenType = 'rust';
  else if (typeChoice.includes('Generic')) chosenType = 'generic';

  writeGitignore(getTemplate(chosenType), cwd);
  success(`.gitignore created (${PROJECT_TYPE_LABELS[chosenType]} template).`);
  blank();
}
