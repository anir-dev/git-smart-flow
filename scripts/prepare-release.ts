import { execSync } from 'child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');
const DIST = join(ROOT, 'dist');
const DOWNLOADS = join(ROOT, 'downloads');

function run(cmd: string): void {
  console.log(`\n$ ${cmd}`);
  execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
}

function step(label: string): void {
  console.log(`\n\x1b[36m── ${label} ──\x1b[0m`);
}

async function main(): Promise<void> {
  step('Clean');
  if (existsSync(DIST)) rmSync(DIST, { recursive: true });
  if (existsSync(DOWNLOADS)) {
    // Keep README.md
    const files = require('fs').readdirSync(DOWNLOADS) as string[];
    for (const f of files) {
      if (f !== 'README.md') rmSync(join(DOWNLOADS, f), { recursive: true });
    }
  } else {
    mkdirSync(DOWNLOADS, { recursive: true });
  }

  step('Build TypeScript');
  run('npm run build');

  step('Run tests');
  run('npm test');

  step('Pack npm tarball');
  run('npm pack');

  step('Build standalone binaries (requires pkg)');
  try {
    run('npx pkg . --out-path downloads');

    step('Create distribution ZIPs');
    const README_FIRST = `# Git Smart Flow — Standalone Binary

No Node.js required. Just run the binary.

## Usage

  ./git-smart-flow setup

## Commands

  git-smart-flow --help

See full docs at: https://github.com/YOUR_USERNAME/git-smart-flow
`;
    writeFileSync(join(DOWNLOADS, 'README_FIRST.md'), README_FIRST);

    const platforms = [
      { binary: 'git-smart-flow-macos', zip: 'GitSmartFlow-macOS.zip' },
      { binary: 'git-smart-flow-win.exe', zip: 'GitSmartFlow-Windows.zip' },
      { binary: 'git-smart-flow-linux', zip: 'GitSmartFlow-Linux.zip' },
    ];

    for (const { binary, zip } of platforms) {
      const binPath = join(DOWNLOADS, binary);
      if (existsSync(binPath)) {
        run(`zip -j ${join(DOWNLOADS, zip)} ${binPath} ${join(DOWNLOADS, 'README_FIRST.md')}`);
        console.log(`✅ Created ${zip}`);
      }
    }
  } catch (e) {
    console.warn('\n⚠ pkg not available or build failed — skipping binaries');
    console.warn('  Install with: npm install -g pkg');
  }

  step('Done');
  console.log('\n✅ Release preparation complete.');
  console.log('   Artifacts in: downloads/');
  console.log('   npm pack .tgz in project root');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
