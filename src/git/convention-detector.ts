import { execSync, spawnSync } from 'child_process';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import type { CommitConvention, ConventionType } from '../types/index.js';

const CONVENTIONAL_TYPES = [
  'feat',
  'fix',
  'docs',
  'style',
  'refactor',
  'perf',
  'test',
  'build',
  'ci',
  'chore',
  'revert',
];

const DEFAULT_CONVENTION: CommitConvention = {
  type: 'conventional',
  allowedTypes: CONVENTIONAL_TYPES,
  allowedScopes: undefined,
  scopeRequired: false,
  maxHeaderLength: 100,
  requireTicket: 'auto',
  ticketPattern: '[A-Z][A-Z0-9]+-[0-9]+',
  subjectCase: 'lower-case',
  hasCommitlint: false,
  hasHusky: false,
};

export async function detectConvention(cwd = process.cwd()): Promise<CommitConvention> {
  const convention = { ...DEFAULT_CONVENTION };

  const commitlintResult = readCommitlint(cwd);
  if (commitlintResult) {
    Object.assign(convention, commitlintResult);
    convention.hasCommitlint = true;
  }

  convention.hasHusky = detectHusky(cwd);
  const monorepoScopes = detectMonorepoScopes(cwd);
  if (monorepoScopes.length > 0) {
    convention.allowedScopes = [...(convention.allowedScopes ?? []), ...monorepoScopes];
  }

  if (!commitlintResult) {
    const historyConvention = await inferFromHistory(cwd);
    if (historyConvention) {
      convention.type = historyConvention;
    }
  }

  return convention;
}

function readCommitlint(cwd: string): Partial<CommitConvention> | null {
  const candidates = [
    'commitlint.config.js',
    'commitlint.config.cjs',
    'commitlint.config.mjs',
    '.commitlintrc',
    '.commitlintrc.json',
    '.commitlintrc.yaml',
    '.commitlintrc.yml',
  ];

  for (const candidate of candidates) {
    const fullPath = join(cwd, candidate);
    if (!existsSync(fullPath)) continue;
    try {
      if (candidate.endsWith('.json') || candidate === '.commitlintrc') {
        const raw = readFileSync(fullPath, 'utf-8');
        return parseCommitlintJson(JSON.parse(raw));
      }
      if (candidate.endsWith('.yaml') || candidate.endsWith('.yml')) {
        const raw = readFileSync(fullPath, 'utf-8');
        return parseCommitlintYaml(raw);
      }
    } catch {
      // skip unparseable files
    }
  }

  const pkgPath = join(cwd, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      if (pkg.commitlint) return parseCommitlintJson(pkg.commitlint);
    } catch {
      // skip
    }
  }

  return null;
}

function parseCommitlintJson(config: Record<string, unknown>): Partial<CommitConvention> {
  const result: Partial<CommitConvention> = {};
  const rules = (config.rules ?? {}) as Record<string, unknown[]>;

  if (rules['type-enum']) {
    const typeRule = rules['type-enum'];
    if (Array.isArray(typeRule) && typeRule.length >= 3 && Array.isArray(typeRule[2])) {
      result.allowedTypes = typeRule[2] as string[];
    }
  }

  if (rules['scope-enum']) {
    const scopeRule = rules['scope-enum'];
    if (Array.isArray(scopeRule) && scopeRule.length >= 3 && Array.isArray(scopeRule[2])) {
      result.allowedScopes = scopeRule[2] as string[];
    }
  }

  if (rules['scope-empty']) {
    const scopeEmptyRule = rules['scope-empty'];
    if (
      Array.isArray(scopeEmptyRule) &&
      scopeEmptyRule[0] === 2 &&
      scopeEmptyRule[1] === 'always'
    ) {
      result.scopeRequired = true;
    }
  }

  if (rules['header-max-length']) {
    const headerRule = rules['header-max-length'];
    if (Array.isArray(headerRule) && typeof headerRule[2] === 'number') {
      result.maxHeaderLength = headerRule[2];
    }
  }

  if (rules['subject-case']) {
    const caseRule = rules['subject-case'];
    if (Array.isArray(caseRule) && typeof caseRule[2] === 'string') {
      result.subjectCase = caseRule[2] as CommitConvention['subjectCase'];
    }
  }

  const preset = (config.extends ?? '') as string | string[];
  const presetStr = Array.isArray(preset) ? preset.join(',') : preset;
  if (presetStr.includes('conventional') || presetStr.includes('angular')) {
    result.type = 'conventional';
    if (!result.allowedTypes) result.allowedTypes = CONVENTIONAL_TYPES;
  }

  return result;
}

function parseCommitlintYaml(raw: string): Partial<CommitConvention> {
  // Minimal YAML parser for the rules we care about — avoids adding js-yaml as a required dep here
  const result: Partial<CommitConvention> = {};
  if (raw.includes('conventional') || raw.includes('angular')) {
    result.type = 'conventional';
    result.allowedTypes = CONVENTIONAL_TYPES;
  }
  const headerMatch = raw.match(/header-max-length[^:]*:[^[]*\[\s*\d+,\s*[^,]+,\s*(\d+)/);
  if (headerMatch) result.maxHeaderLength = parseInt(headerMatch[1], 10);
  return result;
}

function detectHusky(cwd: string): boolean {
  return (
    existsSync(join(cwd, '.husky')) ||
    existsSync(join(cwd, '.husky/commit-msg')) ||
    existsSync(join(cwd, '.husky/pre-commit'))
  );
}

function detectMonorepoScopes(cwd: string): string[] {
  const scopes: string[] = [];

  // nx.json
  if (existsSync(join(cwd, 'nx.json'))) {
    try {
      const output = execSync('ls packages/ 2>/dev/null || ls apps/ 2>/dev/null || true', {
        cwd,
        encoding: 'utf-8',
      });
      scopes.push(...output.split('\n').filter(Boolean));
    } catch {
      /* */
    }
  }

  // package.json workspaces
  const pkgPath = join(cwd, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      if (pkg.workspaces) {
        const ws = Array.isArray(pkg.workspaces) ? pkg.workspaces : (pkg.workspaces.packages ?? []);
        for (const pattern of ws) {
          const dir = pattern.replace(/\/\*$/, '').replace(/\*$/, '');
          const dirPath = join(cwd, dir);
          if (existsSync(dirPath)) {
            try {
              const entries = readdirSync(dirPath) as string[];
              scopes.push(...entries.filter((e: string) => !e.startsWith('.')));
            } catch {
              /* */
            }
          }
        }
      }
    } catch {
      /* */
    }
  }

  return [...new Set(scopes)];
}

async function inferFromHistory(cwd: string): Promise<ConventionType | null> {
  try {
    const result = spawnSync('git', ['log', '--oneline', '-20'], { cwd, encoding: 'utf-8' });
    if (result.status !== 0) return null;
    const lines: string[] = (result.stdout as string).split('\n').filter(Boolean);
    const conventionalPattern =
      /^[a-f0-9]+ (feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\(.+\))?!?:/;
    const matches = lines.filter((l: string) => conventionalPattern.test(l));
    if (matches.length / lines.length >= 0.5) return 'conventional';
  } catch {
    /* */
  }
  return null;
}
