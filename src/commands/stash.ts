import { spawnSync } from 'child_process';
import { getConfig } from '../config/config.js';
import { ensureGitRepo } from '../git/ensure-repo.js';
import {
  hasUncommittedChanges,
  stashList,
  stashApplyRef,
  stashPopRef,
  stashDropRef,
} from '../git/repo.js';
import { blank, error, info, keyValue, section, success, warning } from '../ux/display.js';
import { confirmPrompt, inputPrompt, selectPrompt } from '../ux/prompt.js';

export async function runStash(): Promise<void> {
  const cwd = process.cwd();
  if (!(await ensureGitRepo(cwd))) return;

  const _config = getConfig();

  let running = true;
  while (running) {
    const entries = stashList(cwd);

    section('Gestión de Stash');
    if (entries.length > 0) {
      info(`${entries.length} stash(es) guardados`);
    } else {
      info('No hay stashes guardados');
    }
    blank();

    const menuOptions = [
      '💾 Guardar cambios en stash',
      ...(entries.length > 0
        ? [
            '↩️  Recuperar último stash',
            '🔍 Ver y recuperar stash específico',
            '🗑️  Eliminar stash',
            '📋 Ver lista de stashes',
          ]
        : []),
      '← Salir',
    ];

    const choice = await selectPrompt('¿Qué quieres hacer?', menuOptions);

    if (choice.includes('Guardar')) {
      if (!hasUncommittedChanges(cwd)) {
        warning('No hay cambios para guardar en stash.');
        continue;
      }
      const msg = await inputPrompt('Mensaje del stash (opcional, Enter para omitir)');
      const args = msg.trim()
        ? ['stash', 'push', '-u', '-m', msg.trim()]
        : ['stash', 'push', '-u'];
      const r = spawnSync('git', args, { cwd, encoding: 'utf-8', stdio: 'pipe' });
      if (r.status === 0) {
        success('Cambios guardados en stash.');
      } else {
        error('Error al guardar en stash: ' + (r.stderr ?? ''));
      }
    } else if (choice.includes('último stash')) {
      const latest = entries[0];
      if (!latest) {
        warning('No hay stashes.');
        continue;
      }
      const confirmed = await confirmPrompt(`¿Recuperar "${latest.message}"?`);
      if (!confirmed) continue;
      const r = spawnSync('git', ['stash', 'pop'], { cwd, encoding: 'utf-8', stdio: 'pipe' });
      if (r.status === 0) {
        success('Stash recuperado.');
      } else {
        error('Error al recuperar stash. Puede haber conflictos.');
      }
    } else if (choice.includes('específico')) {
      if (entries.length === 0) {
        info('No hay stashes.');
        continue;
      }
      const stashOptions = entries.map((e) => `${e.ref}  [${e.ago}]  ${e.message}`);
      const picked = await selectPrompt('Selecciona el stash:', stashOptions);
      const selectedEntry = entries[stashOptions.indexOf(picked)];
      if (!selectedEntry) continue;

      const action = await selectPrompt('¿Qué hacer con este stash?', [
        'Aplicar (mantener en lista)',
        'Pop (aplicar y eliminar de lista)',
        '← Volver',
      ]);

      if (action.startsWith('Aplicar')) {
        stashApplyRef(selectedEntry.ref, cwd);
        success('Stash aplicado.');
      } else if (action.startsWith('Pop')) {
        stashPopRef(selectedEntry.ref, cwd);
        success('Stash aplicado y eliminado.');
      }
    } else if (choice.includes('Eliminar')) {
      if (entries.length === 0) {
        info('No hay stashes.');
        continue;
      }
      const stashOptions = [
        ...entries.map((e) => `${e.ref}  [${e.ago}]  ${e.message}`),
        '← Cancelar',
      ];
      const picked = await selectPrompt('¿Cuál stash eliminar?', stashOptions);
      if (picked.includes('Cancelar')) continue;
      const selectedEntry = entries[stashOptions.indexOf(picked)];
      if (!selectedEntry) continue;

      const confirmed = await confirmPrompt(`¿Eliminar "${selectedEntry.message}"?`, false);
      if (!confirmed) continue;
      stashDropRef(selectedEntry.ref, cwd);
      success('Stash eliminado.');
    } else if (choice.includes('lista')) {
      section('Stashes guardados');
      if (entries.length === 0) {
        info('No hay stashes.');
      } else {
        entries.forEach((e) => {
          keyValue(e.ref, `${e.message}  [${e.ago}]`);
        });
      }
      blank();
    } else {
      running = false;
    }
  }
}
