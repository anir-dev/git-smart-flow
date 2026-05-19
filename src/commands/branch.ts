import { getConfig } from '../config/config.js';
import { ensureGitRepo } from '../git/ensure-repo.js';
import { validateBranchName } from '../git/validate.js';
import {
  branchExists,
  createBranch,
  deleteBranch,
  deleteRemoteBranch,
  getCurrentBranch,
  getCommitsSinceBase,
  getUpstream,
  hasUncommittedChanges,
  isProtectedBranch,
  listBranches,
  refExists,
  renameBranch,
  resetHard,
  stashPop,
  stashSave,
  switchBranch,
} from '../git/repo.js';
import { blank, error, info, keyValue, section, success, warning } from '../ux/display.js';
import { confirmPrompt, inputPrompt, selectPrompt } from '../ux/prompt.js';
import { showMenu } from '../ux/menu.js';

// Branch type prefixes that follow common conventions
const BRANCH_TYPES = [
  { prefix: 'feat', label: 'feat     — new feature' },
  { prefix: 'fix', label: 'fix      — bug fix' },
  { prefix: 'hotfix', label: 'hotfix   — urgent production fix' },
  { prefix: 'chore', label: 'chore    — maintenance, tooling' },
  { prefix: 'docs', label: 'docs     — documentation' },
  { prefix: 'refactor', label: 'refactor — code restructuring' },
  { prefix: 'test', label: 'test     — tests only' },
  { prefix: 'release', label: 'release  — release preparation' },
  { prefix: 'custom', label: 'custom   — type it manually' },
];

export async function runBranch(): Promise<void> {
  const cwd = process.cwd();
  if (!(await ensureGitRepo(cwd))) return;

  const current = getCurrentBranch(cwd);

  await showMenu(`Branch Manager  (current: ${current})`, [
    { key: '1', label: 'Create new branch', action: () => createBranchFlow(cwd) },
    { key: '2', label: 'Switch branch', action: () => switchBranchFlow(cwd) },
    { key: '3', label: 'List branches', action: () => listBranchesFlow(cwd) },
    { key: '4', label: 'Delete branch', action: () => deleteBranchFlow(cwd) },
    { key: '5', label: 'Rename current branch', action: () => renameBranchFlow(cwd) },
    { key: '6', label: 'Rescue commits → new branch', action: () => rescueCommitsFlow(cwd) },
    { key: '0', label: 'Back', action: async () => {} },
  ]);
}

// ── Create ─────────────────────────────────────────────────────────────────

async function createBranchFlow(cwd: string): Promise<void> {
  const config = getConfig();
  section('Create New Branch');

  // 1. Type
  const typeChoice = await selectPrompt(
    'Branch type:',
    BRANCH_TYPES.map((t) => t.label)
  );
  const matched = BRANCH_TYPES.find((t) => typeChoice.startsWith(t.prefix));
  let prefix = matched?.prefix ?? 'feat';
  if (prefix === 'custom') {
    prefix = await inputPrompt('Custom prefix (e.g. "experiment")');
  }

  // 2. Optional ticket
  const ticketPattern = new RegExp(config.commit.ticketPattern);
  const ticketHint =
    config.commit.requireTicket === true ? ' (required)' : ' (optional, e.g. PROJ-123)';
  const ticket = await inputPrompt(`Ticket / issue number${ticketHint}`, '');

  if (config.commit.requireTicket === true && ticket && !ticketPattern.test(ticket)) {
    warning(`Ticket "${ticket}" doesn't match pattern ${config.commit.ticketPattern}`);
  }

  // 3. Description → slug (optional)
  const description = await inputPrompt('Short description (optional, e.g. "add login page")', '');
  const slug = toSlug(description);

  // 4. Compose branch name
  const middle = slug ? (ticket ? `${ticket}-${slug}` : slug) : ticket;
  const parts = middle ? [prefix, middle] : [prefix];
  const suggested = parts.join('/');
  const branchName = await inputPrompt('Branch name', suggested);
  if (!branchName.trim()) {
    info('Cancelled.');
    return;
  }

  // 5. Validate
  const vnCreate = validateBranchName(branchName);
  if (!vnCreate.valid) {
    error(`"${branchName}" is not a valid Git branch name: ${vnCreate.reason}`);
    return;
  }
  if (branchExists(branchName, cwd)) {
    error(`Branch "${branchName}" already exists.`);
    return;
  }

  // 6. Base branch
  const currentBranch = getCurrentBranch(cwd);
  const baseCandidates = [
    ...config.git.defaultBaseBranches.filter((b) => branchExists(b, cwd)),
    currentBranch,
  ];
  const uniqueBases = [...new Set(baseCandidates)];
  const baseChoice = await selectPrompt('Base branch (branch off from):', uniqueBases);

  // 7. Create
  try {
    createBranch(branchName, baseChoice, cwd);
    success(`Created and switched to branch "${branchName}" from "${baseChoice}".`);
    blank();
    keyValue('Branch', branchName);
    keyValue('Based on', baseChoice);
    if (ticket) keyValue('Ticket', ticket);
  } catch (e) {
    error(`Failed to create branch: ${(e as Error).message}`);
  }
}

// ── Switch ─────────────────────────────────────────────────────────────────

async function switchBranchFlow(cwd: string): Promise<void> {
  section('Switch Branch');

  if (hasUncommittedChanges(cwd)) {
    warning('You have uncommitted changes. They will carry over to the new branch.');
    const proceed = await confirmPrompt('Continue anyway?', false);
    if (!proceed) {
      info('Cancelled.');
      return;
    }
  }

  const branches = listBranches(false, cwd);
  const current = getCurrentBranch(cwd);
  const others = branches.filter((b) => !b.current && !b.remote);

  if (others.length === 0) {
    info('No other local branches available.');
    return;
  }

  const choices = others.map((b) => `${b.name}${b.merged ? '  (merged)' : ''}`);
  const choice = await selectPrompt('Switch to:', choices);
  const target = choice.split('  ')[0] ?? choice;

  if (target === current) {
    info('Already on that branch.');
    return;
  }

  try {
    switchBranch(target, cwd);
    success(`Switched to "${target}".`);
  } catch (e) {
    error(`Failed to switch: ${(e as Error).message}`);
  }
}

// ── List ───────────────────────────────────────────────────────────────────

async function listBranchesFlow(cwd: string): Promise<void> {
  const includeRemote = await confirmPrompt('Include remote branches?', false);
  const branches = listBranches(includeRemote, cwd);

  section(`Branches (${branches.length})`);
  for (const b of branches) {
    const markers: string[] = [];
    if (b.current) markers.push('current');
    if (b.merged) markers.push('merged');
    if (b.remote) markers.push('remote');
    const suffix = markers.length ? `  [${markers.join(', ')}]` : '';
    console.log(`  ${b.current ? '▶' : ' '} ${b.name}${suffix}`);
  }
  blank();
}

// ── Delete ─────────────────────────────────────────────────────────────────

async function deleteBranchFlow(cwd: string): Promise<void> {
  const config = getConfig();
  section('Delete Branch');

  const branches = listBranches(false, cwd);
  const deletable = branches.filter((b) => !b.current && !b.remote);

  if (deletable.length === 0) {
    info('No branches available to delete (cannot delete the current branch).');
    return;
  }

  const choices = deletable.map((b) => `${b.name}${b.merged ? '  (merged)' : '  (NOT merged)'}`);
  const choice = await selectPrompt('Branch to delete:', [...choices, 'Cancel']);
  if (choice === 'Cancel') return;

  const target = choice.split('  ')[0] ?? choice;

  if (isProtectedBranch(target, config.git.protectedBranches)) {
    error(`"${target}" is a protected branch — deletion blocked.`);
    return;
  }

  const targetInfo = deletable.find((b) => b.name === target);
  if (!targetInfo?.merged) {
    warning(`"${target}" has unmerged commits.`);
    const force = await confirmPrompt('Force delete anyway?', false);
    if (!force) {
      info('Cancelled.');
      return;
    }
    try {
      deleteBranch(target, true, cwd);
      success(`Force deleted "${target}".`);
    } catch (e) {
      error(`Failed: ${(e as Error).message}`);
    }
    return;
  }

  const confirmed = await confirmPrompt(`Delete branch "${target}"?`, false);
  if (!confirmed) {
    info('Cancelled.');
    return;
  }

  try {
    deleteBranch(target, false, cwd);
    success(`Deleted "${target}".`);

    // Offer to delete remote tracking branch too
    const upstream = getUpstream(cwd);
    if (upstream) {
      const remote = upstream.split('/')[0] ?? '';
      const deleteRemote = await confirmPrompt(
        `Also delete remote tracking branch "${remote}/${target}"?`,
        false
      );
      if (deleteRemote) {
        try {
          deleteRemoteBranch(remote, target, cwd);
          success(`Deleted remote branch "${remote}/${target}".`);
        } catch {
          warning('Could not delete remote branch — you may not have push permissions.');
        }
      }
    }
  } catch (e) {
    error(`Failed: ${(e as Error).message}`);
  }
}

// ── Rename ─────────────────────────────────────────────────────────────────

async function renameBranchFlow(cwd: string): Promise<void> {
  const config = getConfig();
  const current = getCurrentBranch(cwd);
  section('Rename Current Branch');

  if (isProtectedBranch(current, config.git.protectedBranches)) {
    error(`"${current}" is a protected branch — renaming blocked.`);
    return;
  }

  const newName = await inputPrompt(`New name for "${current}"`);
  if (!newName.trim()) {
    info('Cancelled.');
    return;
  }

  const vnRename = validateBranchName(newName);
  if (!vnRename.valid) {
    error(`"${newName}" is not a valid Git branch name: ${vnRename.reason}`);
    return;
  }
  if (branchExists(newName, cwd)) {
    error(`Branch "${newName}" already exists.`);
    return;
  }

  const confirmed = await confirmPrompt(`Rename "${current}" → "${newName}"?`);
  if (!confirmed) {
    info('Cancelled.');
    return;
  }

  try {
    renameBranch(newName, cwd);
    success(`Renamed "${current}" → "${newName}".`);
    warning(
      'If this branch was already pushed, update the remote with:\n  git push origin --delete ' +
        current +
        '\n  git push -u origin ' +
        newName
    );
  } catch (e) {
    error(`Failed: ${(e as Error).message}`);
  }
}

// ── Rescue ─────────────────────────────────────────────────────────────────

async function rescueCommitsFlow(cwd: string): Promise<void> {
  section('Rescue Commits → Nueva Rama');

  const current = getCurrentBranch(cwd);

  // Determine the base reference to reset the current branch to after rescue
  const upstream = getUpstream(cwd);
  let rescueBase: string | undefined = upstream;

  if (!rescueBase) {
    for (const candidate of [`origin/${current}`, 'origin/main', 'origin/master']) {
      if (refExists(candidate, cwd)) {
        rescueBase = candidate;
        break;
      }
    }
  }

  // Get commits ahead of the base
  const commits = rescueBase ? getCommitsSinceBase(rescueBase, cwd) : [];

  if (commits.length === 0) {
    info(`"${current}" no tiene commits pendientes de rescatar.`);
    return;
  }

  info(`${commits.length} commit(s) en "${current}" que se moverán:`);
  for (const c of commits) console.log(`  ● ${c}`);
  blank();

  if (!rescueBase) {
    warning(
      'No se encontró rama base en el remoto. Se creará la rama pero no se reseteará la original.'
    );
  }

  // New branch name
  const newBranch = await inputPrompt('Nombre de la nueva rama (ej. feature/mi-cambio)');
  if (!newBranch.trim()) {
    info('Cancelado.');
    return;
  }

  const vnRescue = validateBranchName(newBranch);
  if (!vnRescue.valid) {
    error(`"${newBranch}" no es un nombre de rama Git válido: ${vnRescue.reason}`);
    return;
  }
  if (branchExists(newBranch, cwd)) {
    error(`La rama "${newBranch}" ya existe.`);
    return;
  }

  // Create branch from current HEAD — carries all pending commits
  try {
    createBranch(newBranch, undefined, cwd);
    success(`Rama "${newBranch}" creada con ${commits.length} commit(s).`);
  } catch (e) {
    error(`Error al crear la rama: ${(e as Error).message}`);
    return;
  }

  // Offer to reset the original branch back to its base
  if (rescueBase) {
    blank();
    const resetOriginal = await confirmPrompt(
      `¿Resetear "${current}" a "${rescueBase}"? (borra los commits de esa rama)`,
      false
    );

    if (resetOriginal) {
      const hasChanges = hasUncommittedChanges(cwd);
      if (hasChanges) {
        info('Guardando cambios sin commitear...');
        stashSave('gsf-rescue-temp', cwd);
      }
      try {
        switchBranch(current, cwd);
        resetHard(rescueBase, cwd);
        success(`"${current}" reseteada a "${rescueBase}".`);
      } catch (e) {
        error(`Error al resetear: ${(e as Error).message}`);
      }
      if (hasChanges) {
        stashPop(cwd);
        info('Cambios sin commitear restaurados.');
      }
      switchBranch(newBranch, cwd);
    }
  }

  blank();
  keyValue('Nueva rama', newBranch);
  keyValue('Commits rescatados', String(commits.length));
  if (rescueBase) keyValue('Base', rescueBase);
  blank();
  info('Ejecuta  gsf push  para subir la nueva rama al remoto.');
}

// ── Helpers ────────────────────────────────────────────────────────────────

function toSlug(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 50);
}
