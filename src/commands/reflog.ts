import { spawnSync } from 'child_process';
import { ensureGitRepo } from '../git/ensure-repo.js';
import { blank, error, info, keyValue, section, success, warning } from '../ux/display.js';
import { confirmPrompt, inputPrompt, selectPrompt } from '../ux/prompt.js';

// ── Types ──────────────────────────────────────────────────────────────────

interface ReflogEntry {
  sha: string;
  shortSha: string;
  refName: string;   // e.g. "HEAD@{0}"
  action: string;    // e.g. "commit", "checkout", "reset", "merge", "rebase"
  description: string;
  ago: string;
}

// ── Git helpers ────────────────────────────────────────────────────────────

function getReflog(limit: number, cwd: string): ReflogEntry[] {
  const r = spawnSync('git', [
    'reflog',
    `--max-count=${limit}`,
    '--format=%H\x1f%h\x1f%gd\x1f%gs\x1f%ar',
  ], { cwd, encoding: 'utf-8' });

  if (r.status !== 0 || !r.stdout?.trim()) return [];

  return r.stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [sha, shortSha, refName, description, ago] = line.split('\x1f');
      // Extract action from description: "commit: message" → "commit"
      const colonIdx = (description ?? '').indexOf(':');
      const action = colonIdx > 0 ? (description ?? '').slice(0, colonIdx).trim() : 'unknown';
      return {
        sha: sha ?? '',
        shortSha: shortSha ?? '',
        refName: refName ?? '',
        action,
        description: description ?? '',
        ago: ago ?? '',
      };
    });
}

// ── Recovery flow ──────────────────────────────────────────────────────────

async function flowRecover(entries: ReflogEntry[], cwd: string): Promise<void> {
  const options = entries.map(
    (e) => `${e.refName.padEnd(12)}  ${e.shortSha}  ${e.description}  (${e.ago})`
  );
  options.push('← Cancelar');

  const picked = await selectPrompt('Selecciona la entrada a recuperar:', options);
  if (picked.includes('Cancelar')) return;

  const idx = options.indexOf(picked);
  const entry = entries[idx];
  if (!entry) return;

  blank();
  keyValue('Entrada seleccionada', entry.refName);
  keyValue('Commit', `${entry.shortSha} — ${entry.description}`);
  keyValue('Hace', entry.ago);
  blank();

  const action = await selectPrompt('¿Cómo quieres recuperar este estado?', [
    'Crear rama nueva desde este punto',
    'Reset soft a este punto  (cambios se quedan staged)',
    'Cherry-pick este commit  (traer solo este commit)',
    '← Cancelar',
  ]);

  if (action.includes('rama nueva')) {
    const branchName = await inputPrompt('Nombre de la nueva rama');
    if (!branchName.trim()) return;
    const r = spawnSync('git', ['checkout', '-b', branchName.trim(), entry.sha], {
      cwd,
      encoding: 'utf-8',
      stdio: 'pipe',
    });
    if (r.status === 0) {
      success(`Rama "${branchName.trim()}" creada desde ${entry.shortSha}.`);
    } else {
      error('Error: ' + (r.stderr ?? ''));
    }
  } else if (action.includes('Reset soft')) {
    warning('Esto moverá HEAD a este commit. Los cambios posteriores quedarán staged.');
    const confirmed = await confirmPrompt(`¿Hacer reset soft a ${entry.shortSha}?`);
    if (!confirmed) return;
    const r = spawnSync('git', ['reset', '--soft', entry.sha], {
      cwd,
      encoding: 'utf-8',
      stdio: 'pipe',
    });
    if (r.status === 0) {
      success(`Reset soft a ${entry.shortSha} completado.`);
    } else {
      error('Error: ' + (r.stderr ?? ''));
    }
  } else if (action.includes('Cherry-pick')) {
    const r = spawnSync('git', ['cherry-pick', entry.sha], { cwd, stdio: 'inherit' });
    if (r.status === 0) {
      success('Cherry-pick completado.');
    } else {
      warning('Cherry-pick con conflictos. Resuelve los conflictos y ejecuta "git cherry-pick --continue".');
      warning('Para abortar: git cherry-pick --abort');
    }
  }
}

// ── Diff flow ──────────────────────────────────────────────────────────────

async function flowDiff(entries: ReflogEntry[], cwd: string): Promise<void> {
  const options = entries.map(
    (e) => `${e.refName.padEnd(12)}  ${e.shortSha}  ${e.description}  (${e.ago})`
  );
  options.push('← Cancelar');

  const picked = await selectPrompt('Selecciona la entrada para comparar con HEAD:', options);
  if (picked.includes('Cancelar')) return;

  const idx = options.indexOf(picked);
  const entry = entries[idx];
  if (!entry) return;

  blank();
  info(`Diferencia entre HEAD y ${entry.refName} (${entry.shortSha}):`);
  blank();

  const statR = spawnSync('git', ['diff', '--stat', entry.sha, 'HEAD'], {
    cwd,
    encoding: 'utf-8',
    stdio: 'pipe',
  });
  if (statR.stdout?.trim()) {
    console.log(statR.stdout);
  } else {
    info('No hay diferencias o el commit no es accesible.');
  }
}

// ── Main command ───────────────────────────────────────────────────────────

export async function runReflog(): Promise<void> {
  const cwd = process.cwd();
  if (!(await ensureGitRepo(cwd))) return;

  const LIMIT = 30;

  let running = true;
  while (running) {
    const entries = getReflog(LIMIT, cwd);

    if (entries.length === 0) {
      section('Reflog');
      info('No hay entradas en el reflog. El repositorio puede no tener commits.');
      return;
    }

    section('Reflog — historial de movimientos de HEAD');
    info(`Mostrando las últimas ${entries.length} entradas`);
    blank();

    entries.forEach((e, i) => {
      const idx = String(i).padStart(2, ' ');
      const sha = e.shortSha.padEnd(9, ' ');
      const ref = e.refName.padEnd(12, ' ');
      const ago = (e.ago).padEnd(14, ' ');
      console.log(`  ${idx}  ${sha}  ${ref}  ${ago}  ${e.description}`);
    });
    blank();

    const menuOptions = [
      '🔍 Recuperar una entrada del reflog',
      '↩️  Ver diferencia entre HEAD y una entrada',
      '← Salir',
    ];

    const choice = await selectPrompt('¿Qué quieres hacer?', menuOptions);

    if (choice.includes('Recuperar')) {
      await flowRecover(entries, cwd);
    } else if (choice.includes('diferencia')) {
      await flowDiff(entries, cwd);
    } else {
      running = false;
    }
  }
}
