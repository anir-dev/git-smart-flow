import { spawnSync } from 'child_process';
import { ensureGitRepo } from '../git/ensure-repo.js';
import { blank, error, info, keyValue, section, success, warning } from '../ux/display.js';
import { confirmPrompt, inputPrompt, selectPrompt } from '../ux/prompt.js';

function git(args: string[], cwd: string): { ok: boolean; out: string; err: string } {
  const r = spawnSync('git', args, { cwd, encoding: 'utf-8' });
  return { ok: r.status === 0, out: (r.stdout ?? '').trim(), err: (r.stderr ?? '').trim() };
}

function listTags(cwd: string): string[] {
  const r = git(['tag', '-l', '--sort=-version:refname'], cwd);
  return r.out.split('\n').filter(Boolean);
}

function flowListTags(cwd: string): void {
  const r = git(
    ['tag', '-l', '--sort=-version:refname', '--format=%(refname:short)|%(creatordate:relative)'],
    cwd
  );
  const lines = r.out.split('\n').filter(Boolean);
  if (lines.length === 0) {
    info('No hay tags en este repositorio.');
    return;
  }
  section('Tags');
  for (const line of lines) {
    const [tag, date] = line.split('|');
    keyValue(tag ?? '', date ?? '');
  }
  blank();
}

async function flowCreateLightTag(cwd: string): Promise<void> {
  const name = await inputPrompt('Nombre del tag (ej: v1.0.0)');
  if (!name.trim()) {
    warning('Nombre vacío.');
    return;
  }
  if (/[\s~^:?*[\]\\]/.test(name.trim())) {
    error('Nombre de tag inválido.');
    return;
  }
  const r = git(['tag', name.trim()], cwd);
  if (r.ok) success(`Tag "${name.trim()}" creado.`);
  else error('Error: ' + r.err);
}

async function flowCreateAnnotatedTag(cwd: string): Promise<void> {
  const name = await inputPrompt('Nombre del tag (ej: v1.0.0)');
  if (!name.trim()) return;
  if (/[\s~^:?*[\]\\]/.test(name.trim())) {
    error('Nombre de tag inválido.');
    return;
  }
  const msg = await inputPrompt('Mensaje del tag (descripción del release)');
  if (!msg.trim()) {
    warning('Mensaje vacío.');
    return;
  }
  const r = git(['tag', '-a', name.trim(), '-m', msg.trim()], cwd);
  if (r.ok) success(`Tag anotado "${name.trim()}" creado.`);
  else error('Error: ' + r.err);
}

async function flowDeleteLocalTag(tags: string[], cwd: string): Promise<void> {
  const picked = await selectPrompt('¿Qué tag eliminar?', [...tags, '← Cancelar']);
  if (picked.includes('Cancelar')) return;
  const confirmed = await confirmPrompt(`¿Eliminar tag "${picked}"?`, false);
  if (!confirmed) return;
  const r = git(['tag', '-d', picked], cwd);
  if (r.ok) success(`Tag "${picked}" eliminado localmente.`);
  else error('Error: ' + r.err);
}

async function flowPushTag(tags: string[], cwd: string): Promise<void> {
  const pushOptions = [...tags.map((t) => `  ${t}`), '→ Publicar TODOS los tags', '← Cancelar'];
  const picked = await selectPrompt('¿Qué tag publicar?', pushOptions);
  if (picked.includes('Cancelar')) return;
  if (picked.includes('TODOS')) {
    const r = git(['push', 'origin', '--tags'], cwd);
    if (r.ok) success('Todos los tags publicados en origin.');
    else error('Error: ' + r.err);
  } else {
    const tagName = picked.trim();
    const r = git(['push', 'origin', tagName], cwd);
    if (r.ok) success(`Tag "${tagName}" publicado en origin.`);
    else error('Error: ' + r.err);
  }
}

async function flowDeleteRemoteTag(tags: string[], cwd: string): Promise<void> {
  const picked = await selectPrompt('¿Qué tag eliminar del remoto?', [...tags, '← Cancelar']);
  if (picked.includes('Cancelar')) return;
  warning(`Esto eliminará "${picked}" del remoto (origin). No afecta tu copia local.`);
  const confirmed = await confirmPrompt(`¿Eliminar "${picked}" de origin?`, false);
  if (!confirmed) return;
  const r = git(['push', 'origin', '--delete', picked], cwd);
  if (r.ok) success(`Tag "${picked}" eliminado de origin.`);
  else error('Error al eliminar del remoto: ' + r.err);
}

export async function runTag(): Promise<void> {
  const cwd = process.cwd();
  if (!(await ensureGitRepo(cwd))) return;

  let running = true;
  while (running) {
    const tags = listTags(cwd);
    section('Tag Manager');
    if (tags.length > 0) {
      info(`${tags.length} tag(s) en este repositorio`);
    } else {
      info('No hay tags en este repositorio');
    }
    blank();

    const menuOptions = [
      '🏷  Crear tag ligero',
      '🏷  Crear tag anotado',
      ...(tags.length > 0
        ? [
            '📋 Listar tags con fecha',
            '🗑️  Eliminar tag local',
            '↑  Publicar tag(s) en remoto',
            '↓  Eliminar tag del remoto',
          ]
        : []),
      '← Salir',
    ];

    const choice = await selectPrompt('¿Qué quieres hacer?', menuOptions);

    blank();

    if (choice.includes('ligero')) {
      await flowCreateLightTag(cwd);
    } else if (choice.includes('anotado')) {
      await flowCreateAnnotatedTag(cwd);
    } else if (choice.includes('Listar')) {
      flowListTags(cwd);
    } else if (choice.includes('local')) {
      await flowDeleteLocalTag(tags, cwd);
    } else if (choice.includes('Publicar')) {
      await flowPushTag(tags, cwd);
    } else if (choice.includes('remoto')) {
      await flowDeleteRemoteTag(tags, cwd);
    } else if (choice.includes('Salir') || choice === '← Salir') {
      running = false;
    }
  }
}
