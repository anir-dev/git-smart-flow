import { createInterface } from 'readline';

export async function selectPrompt(message: string, choices: string[]): Promise<string> {
  return new Promise((resolve) => {
    console.log(`\n${message}`);
    choices.forEach((c, i) => console.log(`  ${i + 1}. ${c}`));
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question('\nEnter number: ', (answer) => {
      rl.close();
      const idx = parseInt(answer, 10) - 1;
      resolve(choices[idx] ?? choices[0]);
    });
  });
}

export async function confirmPrompt(message: string, defaultYes = true): Promise<boolean> {
  return new Promise((resolve) => {
    const hint = defaultYes ? '[Y/n]' : '[y/N]';
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`${message} ${hint} `, (answer) => {
      rl.close();
      if (!answer.trim()) { resolve(defaultYes); return; }
      resolve(answer.trim().toLowerCase() === 'y');
    });
  });
}

export async function inputPrompt(message: string, defaultValue?: string): Promise<string> {
  return new Promise((resolve) => {
    const hint = defaultValue ? ` (${defaultValue})` : '';
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`${message}${hint}: `, (answer) => {
      rl.close();
      resolve(answer.trim() || defaultValue || '');
    });
  });
}

export async function passwordPrompt(message: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    process.stdout.write(`${message}: `);
    process.stdin.setRawMode?.(true);
    let password = '';
    process.stdin.once('data', function handler(data: Buffer) {
      process.stdin.setRawMode?.(false);
      rl.close();
      process.stdout.write('\n');
      password = data.toString().trim();
      resolve(password);
    });
  });
}

export async function multiselectPrompt(message: string, choices: string[]): Promise<string[]> {
  return new Promise((resolve) => {
    console.log(`\n${message} (comma-separated numbers, e.g. 1,3):`);
    choices.forEach((c, i) => console.log(`  ${i + 1}. ${c}`));
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question('\nEnter numbers: ', (answer) => {
      rl.close();
      const selected = answer.split(',')
        .map((s) => parseInt(s.trim(), 10) - 1)
        .filter((i) => i >= 0 && i < choices.length)
        .map((i) => choices[i]);
      resolve(selected);
    });
  });
}

// ── Smart file selector ────────────────────────────────────────────────────
// Uses flat multiselect for ≤20 files; directory-grouped UI for more.

const DIR_THRESHOLD = 20;
const PAGE_SIZE = 30;

export async function smartFileSelectPrompt(message: string, files: string[]): Promise<string[]> {
  if (files.length <= DIR_THRESHOLD) {
    return multiselectPrompt(message, files);
  }
  return directoryModeSelect(message, files);
}

function groupByTopDir(files: string[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const f of files) {
    const slash = f.indexOf('/');
    const key = slash > 0 ? f.slice(0, slash + 1) : '(root)';
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(f);
  }
  return map;
}

async function ask(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(prompt, (a) => { rl.close(); resolve(a.trim()); });
  });
}

async function directoryModeSelect(message: string, files: string[]): Promise<string[]> {
  const dirMap = groupByTopDir(files);
  const dirs = [...dirMap.entries()].sort(([a], [b]) => a.localeCompare(b));

  console.log(`\n${message}  [${files.length} files]\n`);
  console.log(`  a.  Stage ALL ${files.length} files`);
  dirs.forEach(([dir, dirFiles], i) => {
    const label = dir.padEnd(30);
    console.log(`  ${String(i + 1).padStart(2)}.  ${label}  ${dirFiles.length} file(s)`);
  });
  console.log('   f.  Browse / select individual files');
  console.log('   0.  Cancel — stage nothing');
  console.log('\n  Tip: combine with commas, e.g. "1,3" stages those two directories.');

  const raw = await ask('\nChoice: ');
  const tokens = raw ? raw.split(',').map((t) => t.trim().toLowerCase()) : [];
  if (!tokens.length || tokens.includes('0')) return [];
  if (tokens.includes('a')) return files;

  const selected: string[] = [];
  for (const token of tokens) {
    if (token === 'f') {
      const picked = await browseFilesPrompt(files);
      selected.push(...picked);
      continue;
    }
    const idx = parseInt(token, 10) - 1;
    if (idx < 0 || idx >= dirs.length) continue;
    const [dirName, dirFiles] = dirs[idx];

    if (dirFiles.length > DIR_THRESHOLD) {
      const all = await confirmPrompt(`Stage all ${dirFiles.length} file(s) in ${dirName}?`, true);
      if (all) {
        selected.push(...dirFiles);
      } else {
        // Recurse into sub-directories of this directory
        const sub = await directoryModeSelect(`Select in ${dirName}`, dirFiles);
        selected.push(...sub);
      }
    } else {
      const all = await confirmPrompt(`Stage all ${dirFiles.length} file(s) in ${dirName}?`, true);
      if (all) {
        selected.push(...dirFiles);
      } else {
        const picked = await multiselectPrompt(`Files in ${dirName}`, dirFiles);
        selected.push(...picked);
      }
    }
  }

  return [...new Set(selected)];
}

async function browseFilesPrompt(files: string[]): Promise<string[]> {
  const total = Math.ceil(files.length / PAGE_SIZE);
  let page = 0;
  const selected = new Set<string>();

  while (true) {
    const s = page * PAGE_SIZE;
    const e = Math.min(s + PAGE_SIZE, files.length);
    console.log(`\nFiles ${s + 1}–${e} of ${files.length}  (page ${page + 1}/${total}):`);
    for (let i = s; i < e; i++) {
      const mark = selected.has(files[i]) ? '✓' : ' ';
      console.log(`  ${mark} ${String(i + 1).padStart(5)}.  ${files[i]}`);
    }

    const hints = ['numbers to toggle (e.g. 1,3,5)'];
    if (page < total - 1) hints.push('"n" next');
    if (page > 0) hints.push('"p" prev');
    hints.push('"done" confirm');

    const ans = await ask(`\n(${hints.join(' · ')}) > `);
    if (ans === 'done' || ans === '') break;
    if (ans === 'n' && page < total - 1) { page++; continue; }
    if (ans === 'p' && page > 0) { page--; continue; }

    for (const t of ans.split(',')) {
      const i = parseInt(t.trim(), 10) - 1;
      if (i >= 0 && i < files.length) {
        if (selected.has(files[i])) selected.delete(files[i]);
        else selected.add(files[i]);
      }
    }
  }

  return [...selected];
}
