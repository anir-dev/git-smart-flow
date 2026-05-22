import { basename, extname } from 'path';
import type { AIContext, CommitConvention, StagedFile } from '../types/index.js';

export function buildAIContext(params: {
  repoName: string;
  branch: string;
  ticket?: string;
  convention: CommitConvention;
  stagedFiles: StagedFile[];
  diff?: string;
  allowRawDiff?: boolean;
}): AIContext {
  const { repoName, branch, ticket, convention, stagedFiles, diff, allowRawDiff } = params;

  const changedFiles = stagedFiles.map((f) => ({ path: f.path, status: f.status }));
  const localSummary = buildLocalSummary(stagedFiles);
  const sanitizedFragments =
    allowRawDiff && diff
      ? buildRawFragments(stagedFiles, diff)
      : buildHeuristicFragments(stagedFiles);

  return {
    repository: repoName,
    branch,
    ticket,
    detectedCommitConvention: convention,
    changedFiles,
    localSummary,
    sanitizedFragments,
  };
}

function buildLocalSummary(files: StagedFile[]): string[] {
  const summary: string[] = [];
  const byStatus = groupByStatus(files);

  if (byStatus['added']?.length)
    summary.push(`Added: ${byStatus['added'].map((f) => f.path).join(', ')}`);
  if (byStatus['modified']?.length)
    summary.push(`Modified: ${byStatus['modified'].map((f) => f.path).join(', ')}`);
  if (byStatus['deleted']?.length)
    summary.push(`Deleted: ${byStatus['deleted'].map((f) => f.path).join(', ')}`);
  if (byStatus['renamed']?.length)
    summary.push(`Renamed: ${byStatus['renamed'].map((f) => f.path).join(', ')}`);

  return summary;
}

function buildHeuristicFragments(files: StagedFile[]): AIContext['sanitizedFragments'] {
  return files.map((file) => ({
    file: file.path,
    summary: heuristicSummary(file),
  }));
}

function buildRawFragments(files: StagedFile[], diff: string): AIContext['sanitizedFragments'] {
  return files.map((file) => {
    const fileDiff = extractFileDiff(diff, file.path);
    return {
      file: file.path,
      summary: fileDiff || heuristicSummary(file),
    };
  });
}

function heuristicSummary(file: StagedFile): string {
  const path = file.path;
  const ext = extname(path).slice(1);
  const name = basename(path, extname(path));

  const dirHints: Record<string, string> = {
    test: 'test file',
    tests: 'test file',
    __tests__: 'test file',
    spec: 'test file',
    docs: 'documentation',
    doc: 'documentation',
    ci: 'CI configuration',
    '.github': 'GitHub configuration',
    '.husky': 'Git hooks',
    scripts: 'build/release script',
    migrations: 'database migration',
    config: 'configuration',
    types: 'type definitions',
    interfaces: 'interface definitions',
    models: 'data model',
    controllers: 'controller',
    routes: 'route definition',
    services: 'service module',
    utils: 'utility function',
    helpers: 'helper function',
  };

  const parts = path.split('/');
  for (const part of parts) {
    const hint = dirHints[part.toLowerCase()];
    if (hint) return `${file.status} ${hint}: ${name}.${ext}`;
  }

  const extHints: Record<string, string> = {
    md: 'documentation file',
    yml: 'configuration file',
    yaml: 'configuration file',
    json: 'configuration/data file',
    ts: 'TypeScript module',
    js: 'JavaScript module',
    tsx: 'React component',
    jsx: 'React component',
    css: 'stylesheet',
    scss: 'stylesheet',
    sql: 'database script',
    sh: 'shell script',
    ps1: 'PowerShell script',
  };

  const extHint = extHints[ext] ?? 'file';
  return `${file.status} ${extHint}: ${name}.${ext}`;
}

function extractFileDiff(diff: string, filePath: string): string {
  const lines = diff.split('\n');
  const startIdx = lines.findIndex((l) => l.startsWith('diff --git') && l.includes(filePath));
  if (startIdx === -1) return '';
  const endIdx = lines.findIndex((l, i) => i > startIdx && l.startsWith('diff --git'));
  const chunk = endIdx === -1 ? lines.slice(startIdx) : lines.slice(startIdx, endIdx);
  return chunk.slice(0, 50).join('\n');
}

function groupByStatus(files: StagedFile[]): Record<string, StagedFile[]> {
  return files.reduce(
    (acc, file) => {
      (acc[file.status] = acc[file.status] ?? []).push(file);
      return acc;
    },
    {} as Record<string, StagedFile[]>
  );
}
