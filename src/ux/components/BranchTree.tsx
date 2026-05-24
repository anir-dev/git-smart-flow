import { useEffect, useState, type JSX } from 'react';
import { Box, Text } from 'ink';
import { spawnSync } from 'child_process';
import { branchColor, theme } from '../theme.js';

interface Props {
  cwd?: string;
  limit?: number;
  showMeta?: boolean;
}

interface ParsedLine {
  graph: string;
  sha: string;
  msg: string;
  refs: string[];
  ago: string;
}

// Format: graph_prefix + sha \x1f subject \x1f relative-date \x1f decoration
function parseGraphLine(line: string): ParsedLine {
  const parts = line.split('\x1f');

  if (parts.length >= 4) {
    const graphAndSha = parts[0] ?? '';
    const rawMsg = parts[1] ?? '';
    const ago = parts[2] ?? '';
    const refsStr = parts[3] ?? '';

    const refs = refsStr
      ? refsStr
          .split(', ')
          .map((r) => r.replace(/^HEAD -> /, '').trim())
          .filter(Boolean)
      : [];

    const shaMatch = graphAndSha.match(/\b([0-9a-f]{6,10})\b/);
    const sha = shaMatch ? (shaMatch[1] ?? '') : '';

    const graphPart = graphAndSha.replace(/\b[0-9a-f]{7,}\b.*/, '').trimEnd();
    const graphUnicode = toUnicodeGraph(graphPart);

    const msg = rawMsg.length > 38 ? rawMsg.slice(0, 37) + '…' : rawMsg;

    return { graph: graphUnicode, sha, msg, refs, ago };
  }

  // Pure graph continuation line (no commit data on this line)
  return { graph: toUnicodeGraph(parts[0] ?? ''), sha: '', msg: '', refs: [], ago: '' };
}

function toUnicodeGraph(s: string): string {
  return s
    .replace(/\*/g, '●')
    .replace(/\|/g, '│')
    .replace(/\//g, '╭')
    .replace(/\\/g, '╰')
    .replace(/-/g, '─');
}

export function BranchTree({
  cwd = process.cwd(),
  limit = 8,
  showMeta = false,
}: Props): JSX.Element {
  const [lines, setLines] = useState<string[]>([]);

  useEffect(() => {
    const result = spawnSync(
      'git',
      ['log', '--graph', '--format=%h\x1f%s\x1f%ar\x1f%D', '--color=never', '--all', `-${limit}`],
      { cwd, encoding: 'utf-8' }
    );
    if (result.status === 0 && result.stdout) {
      setLines(result.stdout.trim().split('\n').filter(Boolean));
    }
  }, [cwd, limit]);

  if (lines.length === 0) {
    return (
      <Box marginBottom={1}>
        <Text color={theme.muted}> ● (no commits yet)</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginBottom={1}>
      {lines.map((rawLine, i) => {
        const { graph, sha, msg, refs, ago } = parseGraphLine(rawLine);
        const mainRef = refs[0];
        const refColor = mainRef ? branchColor(mainRef) : theme.muted;
        const isHead = refs.some((r) => r === 'HEAD' || r.startsWith('HEAD'));

        return (
          <Box key={i}>
            <Text color={theme.muted}>{graph} </Text>
            {sha ? (
              <>
                <Text color={isHead ? theme.accent : theme.muted}>{sha} </Text>
                <Text bold={isHead} color={isHead ? 'white' : '#d1d5db'}>
                  {msg}
                </Text>
                {mainRef && mainRef !== 'HEAD' && <Text color={refColor}> {mainRef}</Text>}
                {showMeta && ago && <Text color={theme.muted}> {ago}</Text>}
              </>
            ) : null}
          </Box>
        );
      })}
    </Box>
  );
}
