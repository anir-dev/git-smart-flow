import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import type { GlobalConfig, LocalConfig, MergedConfig } from '../types/index.js';

const GLOBAL_CONFIG_DIR = join(homedir(), '.git-smart-flow');
const GLOBAL_CONFIG_PATH = join(GLOBAL_CONFIG_DIR, 'config.json');
const LOCAL_CONFIG_FILENAME = '.git-smart-flow.json';

export const DEFAULT_CONFIG: GlobalConfig = {
  language: {
    commit: 'en',
    prTitle: 'en',
    prBody: 'en',
  },
  ai: {
    enabled: true,
    provider: 'heuristic',
    mode: 'enriched',
    allowRawDiff: false,
    showPromptBeforeSend: false,
  },
  git: {
    protectedBranches: ['main', 'master', 'develop'],
    defaultBaseBranches: ['develop', 'main', 'master'],
  },
  commit: {
    convention: 'conventional',
    maxHeaderLength: 100,
    requireTicket: 'auto',
    ticketPattern: '[A-Z][A-Z0-9]+-[0-9]+',
  },
  security: {
    blockOnSecrets: true,
    redactSecrets: true,
    blockedFiles: ['.env', '*.pem', '*.key', '*.p12', 'credentials.json', 'secrets.json'],
  },
  aliases: {
    gsfc: false,
    gsfm: false,
    gsfp: false,
    gsfpr: false,
  },
};

export function loadGlobalConfig(): GlobalConfig {
  if (!existsSync(GLOBAL_CONFIG_PATH)) {
    return DEFAULT_CONFIG;
  }
  try {
    const raw = readFileSync(GLOBAL_CONFIG_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return deepMerge(DEFAULT_CONFIG as unknown as Record<string, unknown>, parsed) as unknown as GlobalConfig;
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function saveGlobalConfig(config: GlobalConfig): void {
  if (!existsSync(GLOBAL_CONFIG_DIR)) {
    mkdirSync(GLOBAL_CONFIG_DIR, { recursive: true });
  }
  writeFileSync(GLOBAL_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}

export function loadLocalConfig(cwd = process.cwd()): LocalConfig | null {
  const localPath = join(cwd, LOCAL_CONFIG_FILENAME);
  if (!existsSync(localPath)) return null;
  try {
    const raw = readFileSync(localPath, 'utf-8');
    return JSON.parse(raw) as LocalConfig;
  } catch {
    return null;
  }
}

export function saveLocalConfig(config: LocalConfig, cwd = process.cwd()): void {
  const localPath = join(cwd, LOCAL_CONFIG_FILENAME);
  writeFileSync(localPath, JSON.stringify(config, null, 2), 'utf-8');
}

export function mergeConfigs(
  global: GlobalConfig,
  local: LocalConfig | null,
  cliOverrides?: Partial<GlobalConfig>
): MergedConfig {
  let merged: Record<string, unknown> = { ...(global as unknown as Record<string, unknown>) };
  if (local) {
    merged = deepMerge(merged, local as unknown as Record<string, unknown>);
  }
  if (cliOverrides) {
    merged = deepMerge(merged, cliOverrides as unknown as Record<string, unknown>);
  }
  return { ...(merged as unknown as GlobalConfig), _source: 'merged' };
}

export function getConfig(cliOverrides?: Partial<GlobalConfig>): MergedConfig {
  const global = loadGlobalConfig();
  const local = loadLocalConfig();
  return mergeConfigs(global, local, cliOverrides);
}

export function globalConfigExists(): boolean {
  return existsSync(GLOBAL_CONFIG_PATH);
}

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    const sv = source[key];
    const tv = target[key];
    if (sv && typeof sv === 'object' && !Array.isArray(sv) && tv && typeof tv === 'object' && !Array.isArray(tv)) {
      result[key] = deepMerge(tv as Record<string, unknown>, sv as Record<string, unknown>);
    } else if (sv !== undefined) {
      result[key] = sv;
    }
  }
  return result;
}
