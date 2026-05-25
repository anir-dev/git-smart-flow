import type { JSX } from 'react';
import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { Select } from '@inkjs/ui';
import { spawnSync } from 'child_process';
import { basename } from 'path';
import { theme, branchColor } from '../theme.js';

// ── Types ──────────────────────────────────────────────────────────────────

interface GitContext {
  repoName: string;
  branch: string;
  modified: number;
  ahead: number;
  behind: number;
}

export interface ShellOption {
  label: string;
  value: string;
}

interface GsfShellProps {
  version: string;
  options: ShellOption[];
  onSelect: (value: string) => void;
  cwd?: string;
  /** Pre-rendered content rendered above the menu (e.g. StatusDashboard) */
  dashboardElement?: JSX.Element;
}

// ── Git context reader ─────────────────────────────────────────────────────

function readGitContext(cwd: string): GitContext {
  const repoName = basename(cwd);
  const r = spawnSync('git', ['status', '--porcelain=v2', '--branch'], {
    cwd,
    encoding: 'utf-8',
    stdio: 'pipe',
  });

  if (r.status !== 0) {
    return { repoName, branch: 'HEAD', modified: 0, ahead: 0, behind: 0 };
  }

  let branch = 'HEAD',
    ahead = 0,
    behind = 0,
    modified = 0;
  for (const line of (r.stdout ?? '').split('\n')) {
    if (line.startsWith('# branch.head ')) branch = line.slice(14).trim();
    if (line.startsWith('# branch.ab ')) {
      const m = line.match(/\+(\d+) -(\d+)/);
      if (m) {
        ahead = +(m[1] ?? 0);
        behind = +(m[2] ?? 0);
      }
    }
    if (line.startsWith('1 ') || line.startsWith('2 ') || line.startsWith('? ')) modified++;
  }

  return { repoName, branch, modified, ahead, behind };
}

// ── Sub-components ─────────────────────────────────────────────────────────

function Header({ version }: { version: string }): JSX.Element {
  return (
    <Box paddingX={1} paddingTop={1} paddingBottom={1}>
      <Text color={theme.accent} bold>
        {'◆ '}
      </Text>
      <Text bold color="white">
        {'Git Smart Flow  '}
      </Text>
      <Text color={theme.muted}>{'v' + version}</Text>
    </Box>
  );
}

function Divider(): JSX.Element {
  const width = Math.min(process.stdout.columns ?? 80, 120);
  return (
    <Box>
      <Text color={theme.border}>{'─'.repeat(width)}</Text>
    </Box>
  );
}

function StatusBar({ ctx }: { ctx: GitContext }): JSX.Element {
  return (
    <Box paddingX={1} gap={2}>
      <Text color={theme.accent} bold>
        ◆
      </Text>
      <Text bold color="#ff79c6">
        {ctx.repoName}
      </Text>
      <Text color={branchColor(ctx.branch)}>{ctx.branch}</Text>
      {ctx.modified > 0 ? (
        <Text color={theme.warning}>{'±' + ctx.modified}</Text>
      ) : (
        <Text color={theme.muted} dimColor>
          ✓
        </Text>
      )}
      {ctx.ahead > 0 && <Text color={theme.success}>{'↑' + ctx.ahead}</Text>}
      {ctx.behind > 0 && <Text color={theme.error}>{'↓' + ctx.behind}</Text>}
    </Box>
  );
}

function Hints(): JSX.Element {
  return (
    <Box paddingX={1} paddingBottom={1}>
      <Text color={theme.muted} dimColor>
        ↑↓ navigate Enter select q quit
      </Text>
    </Box>
  );
}

// ── Main shell component ───────────────────────────────────────────────────

export function GsfShell({
  version,
  options,
  onSelect,
  cwd = process.cwd(),
  dashboardElement,
}: GsfShellProps): JSX.Element {
  const [active, setActive] = useState(false);
  const gitCtx = readGitContext(cwd);

  useEffect(() => {
    const t = setTimeout(() => setActive(true), 120);
    return () => clearTimeout(t);
  }, []);

  useInput((input) => {
    if (input === 'q') process.exit(0);
  });

  return (
    <Box flexDirection="column" paddingX={1}>
      <Header version={version} />
      <Divider />

      {/* Repo info + commit graph — only shown when data is available */}
      {dashboardElement && (
        <Box flexDirection="column" marginTop={1}>
          {dashboardElement}
        </Box>
      )}

      {/* Menu */}
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={theme.border}
        paddingX={1}
        marginTop={1}
        marginBottom={1}
      >
        <Text bold color={theme.muted}>
          ¿Qué quieres hacer?
        </Text>
        <Text color={theme.muted}> </Text>
        <Select
          isDisabled={!active}
          options={options}
          onChange={onSelect}
          visibleOptionCount={options.length}
        />
      </Box>

      <Divider />
      <StatusBar ctx={gitCtx} />
      <Hints />
    </Box>
  );
}
