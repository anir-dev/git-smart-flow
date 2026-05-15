export const theme = {
  success:     '#22c55e',
  error:       '#ef4444',
  warning:     '#f59e0b',
  info:        '#3b82f6',
  muted:       '#6b7280',

  branch: {
    main:     '#8b5cf6',
    develop:  '#3b82f6',
    feature:  '#22c55e',
    fix:      '#f59e0b',
    hotfix:   '#ef4444',
    release:  '#06b6d4',
    chore:    '#6b7280',
    other:    '#a3a3a3',
  },

  commitType: {
    feat:     '#22c55e',
    fix:      '#ef4444',
    docs:     '#3b82f6',
    style:    '#a855f7',
    refactor: '#f59e0b',
    perf:     '#06b6d4',
    test:     '#84cc16',
    build:    '#6b7280',
    ci:       '#6b7280',
    chore:    '#6b7280',
    revert:   '#ef4444',
  },

  border:      '#374151',
  borderFocus: '#3b82f6',
  headerBg:    '#1f2937',
  accent:      '#6366f1',
} as const;

export function branchColor(branch: string): string {
  if (branch === 'main' || branch === 'master') return theme.branch.main;
  if (branch === 'develop' || branch === 'development') return theme.branch.develop;
  if (branch.startsWith('feature/') || branch.startsWith('feat/')) return theme.branch.feature;
  if (branch.startsWith('fix/') || branch.startsWith('bugfix/')) return theme.branch.fix;
  if (branch.startsWith('hotfix/')) return theme.branch.hotfix;
  if (branch.startsWith('release/')) return theme.branch.release;
  if (branch.startsWith('chore/')) return theme.branch.chore;
  return theme.branch.other;
}

export function commitTypeColor(type: string): string {
  return (theme.commitType as Record<string, string>)[type] ?? theme.muted;
}
