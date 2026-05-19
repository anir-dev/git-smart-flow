import { spawnSync } from 'child_process';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getConfig, globalConfigExists } from '../config/config.js';
import { detectConvention } from '../git/convention-detector.js';
import { isGitRepo } from '../git/repo.js';
import { detectAvailableProviders } from '../providers/provider.factory.js';
import { isCI } from '../ux/renderer.js';
import { blank, divider, error, info, keyValue, section, success, warning } from '../ux/display.js';
import type { DiagSection } from '../ux/components/DiagnosticReport.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function gatherDiagData(): Promise<{
  pkg: { version: string };
  nodeOk: boolean;
  nodeVersion: string;
  gitVersion: string;
  gitOk: boolean;
  isRepo: boolean;
  convType: string;
  hasCommitlint: boolean;
  hasHusky: boolean;
  hasGlobalConfig: boolean;
  configProvider: string;
  configLang: string;
  available: string[];
  sections: DiagSection[];
  allOk: boolean;
}> {
  const pkg = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf-8')) as {
    version: string;
  };
  const nodeVersion = process.version;
  const nodeOk = parseInt(nodeVersion.slice(1), 10) >= 18;

  const gitResult = spawnSync('git', ['--version'], { encoding: 'utf-8' });
  const gitOk = gitResult.status === 0;
  const gitVersion = gitOk ? gitResult.stdout.trim().replace('git version ', '') : 'not found';

  const hasGlobalConfig = globalConfigExists();
  const config = hasGlobalConfig ? getConfig() : null;
  const configProvider = config?.ai.provider ?? '(none)';
  const configLang = config?.language.commit ?? '(none)';

  const cwd = process.cwd();
  const isRepo = isGitRepo(cwd);
  let convType = '—';
  let hasCommitlint = false;
  let hasHusky = false;

  if (isRepo) {
    const convention = await detectConvention(cwd);
    convType = convention.type;
    hasCommitlint = convention.hasCommitlint;
    hasHusky = convention.hasHusky;
  }

  const available = (await detectAvailableProviders()) as string[];
  const allProviders = ['heuristic', 'ollama', 'copilot', 'openai', 'claude'];

  const sections: DiagSection[] = [
    {
      title: 'Sistema',
      items: [
        {
          status: nodeOk ? 'ok' : 'error',
          label: `Node.js  ${nodeVersion}`,
          value: nodeOk ? '(requerido ≥18)' : '— necesita actualización',
        },
        {
          status: gitOk ? 'ok' : 'error',
          label: `Git  ${gitVersion}`,
        },
        {
          status: 'info',
          label: `git-smart-flow v${pkg.version}`,
        },
      ],
    },
    {
      title: 'Configuración',
      items: [
        {
          status: hasGlobalConfig ? 'ok' : 'warn',
          label: hasGlobalConfig
            ? 'Config global   ~/.git-smart-flow/config.json'
            : 'Sin config global — ejecuta "gsf setup"',
        },
        ...(hasGlobalConfig
          ? [
              { status: 'info' as const, label: 'AI Provider', value: configProvider },
              { status: 'info' as const, label: 'Idioma', value: configLang },
            ]
          : []),
      ],
    },
    {
      title: 'Repositorio',
      items: isRepo
        ? [
            { status: 'ok' as const, label: 'Git repo detectado' },
            {
              status: hasCommitlint ? 'ok' : ('info' as const),
              label: `Commitlint  ${hasCommitlint ? 'detectado' : 'no detectado'}`,
            },
            {
              status: hasHusky ? 'ok' : ('info' as const),
              label: `Husky  ${hasHusky ? 'detectado' : 'no detectado'}`,
            },
            { status: 'info' as const, label: `Convención  ${convType}` },
          ]
        : [{ status: 'info' as const, label: 'No estás en un repositorio Git' }],
    },
    {
      title: 'Proveedores de IA',
      items: allProviders.map((p) => ({
        status: available.includes(p) ? 'ok' : 'muted',
        label: p,
        value: available.includes(p) ? 'disponible' : 'no disponible',
        active: available.includes(p) && p === configProvider,
      })),
    },
  ];

  const allOk = nodeOk && gitOk;

  return {
    pkg,
    nodeOk,
    nodeVersion,
    gitVersion,
    gitOk,
    isRepo,
    convType,
    hasCommitlint,
    hasHusky,
    hasGlobalConfig,
    configProvider,
    configLang,
    available,
    sections,
    allOk,
  };
}

async function runInkDoctor(): Promise<void> {
  const React = (await import('react')).default;
  const { render } = await import('ink');
  const { DiagnosticReport } = await import('../ux/components/DiagnosticReport.js');

  const data = await gatherDiagData();

  const { unmount } = render(
    React.createElement(DiagnosticReport, {
      title: 'Git Smart Flow — Diagnóstico del entorno',
      sections: data.sections,
      allOk: data.allOk,
    }) as JSX.Element
  );
  // Let one render cycle complete then unmount cleanly
  await new Promise<void>((r) =>
    setImmediate(() => {
      unmount();
      r();
    })
  );
  console.log('');
}

async function runPlainDoctor(): Promise<void> {
  const pkg = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf-8')) as {
    version: string;
  };
  section('Environment Diagnostic');

  const nodeVersion = process.version;
  const nodeOk = parseInt(nodeVersion.slice(1), 10) >= 18;
  if (nodeOk) {
    success(`Node.js ${nodeVersion}`);
  } else {
    error(`Node.js ${nodeVersion} — requires >= 18`);
  }

  const gitResult = spawnSync('git', ['--version'], { encoding: 'utf-8' });
  if (gitResult.status === 0) {
    success(gitResult.stdout.trim());
  } else {
    error('Git not found — install Git to use this tool');
  }

  info(`git-smart-flow v${pkg.version}`);
  blank();

  section('Configuration');
  if (globalConfigExists()) {
    success('Global config found (~/.git-smart-flow/config.json)');
    const config = getConfig();
    keyValue('AI Provider', config.ai.provider, 2);
    keyValue('Language', config.language.commit, 2);
  } else {
    warning('No global config — run "git-smart-flow setup" to create one');
  }

  blank();
  section('Repository');
  const cwd = process.cwd();
  if (isGitRepo(cwd)) {
    success('Inside a Git repository');
    const convention = await detectConvention(cwd);
    keyValue('Convention', convention.type, 2);
    keyValue('Commitlint', convention.hasCommitlint ? 'detected' : 'not detected', 2);
    keyValue('Husky', convention.hasHusky ? 'detected' : 'not detected', 2);
  } else {
    info('Not inside a Git repository');
  }

  blank();
  section('AI Providers');
  const available = await detectAvailableProviders();
  const allProviders = ['heuristic', 'ollama', 'copilot', 'openai', 'claude'] as const;
  for (const p of allProviders) {
    if (available.includes(p)) success(`${p} — available`);
    else info(`${p} — not available`);
  }

  blank();
  divider();
}

export async function runDoctor(): Promise<void> {
  if (isCI()) {
    await runPlainDoctor();
  } else {
    await runInkDoctor();
  }
}
