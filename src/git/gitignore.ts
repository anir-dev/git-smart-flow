import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

export type ProjectType = 'node' | 'python' | 'java' | 'go' | 'rust' | 'generic';

export function detectProjectType(cwd: string): ProjectType {
  if (existsSync(join(cwd, 'package.json'))) return 'node';
  if (
    existsSync(join(cwd, 'requirements.txt')) ||
    existsSync(join(cwd, 'pyproject.toml')) ||
    existsSync(join(cwd, 'setup.py'))
  )
    return 'python';
  if (existsSync(join(cwd, 'pom.xml')) || existsSync(join(cwd, 'build.gradle'))) return 'java';
  if (existsSync(join(cwd, 'go.mod'))) return 'go';
  if (existsSync(join(cwd, 'Cargo.toml'))) return 'rust';
  return 'generic';
}

export const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  node: 'Node.js / TypeScript / JavaScript',
  python: 'Python',
  java: 'Java / Kotlin (Maven / Gradle)',
  go: 'Go',
  rust: 'Rust',
  generic: 'Generic (editor files, env, logs)',
};

const TEMPLATES: Record<ProjectType, string> = {
  node: `# Dependencies
node_modules/
.pnp
.pnp.js

# Build output
dist/
build/
out/
.next/
.nuxt/

# Environment variables — NEVER commit secrets
.env
.env.local
.env.*.local
.env.production

# Package manager locks (keep only the one you use)
# yarn.lock
# pnpm-lock.yaml

# Logs
logs/
*.log
npm-debug.log*
yarn-debug.log*
pnpm-debug.log*
lerna-debug.log*

# Runtime data
pids/
*.pid
*.seed
*.pid.lock

# Test & coverage
coverage/
.nyc_output/
*.lcov

# IDE / Editor
.vscode/
.idea/
*.swp
*.swo
.project
.classpath

# OS
.DS_Store
Thumbs.db
Desktop.ini

# Temp
*.tmp
*.temp
.cache/
`,

  python: `# Byte-compiled / optimized / DLL files
__pycache__/
*.py[cod]
*$py.class
*.pyo

# Distribution / packaging
dist/
build/
*.egg-info/
.eggs/
*.whl

# Virtual environments
.venv/
venv/
env/
.Python

# Environment variables
.env
.env.*

# Test & coverage
.coverage
htmlcov/
.pytest_cache/
.tox/

# Type checking
.mypy_cache/
.pytype/

# IDE / Editor
.vscode/
.idea/
*.swp

# OS
.DS_Store
Thumbs.db
`,

  java: `# Compiled output
*.class
target/
build/
out/

# Package files
*.jar
*.war
*.ear

# Maven wrapper
.mvn/wrapper/maven-wrapper.jar
!.mvn/wrapper/maven-wrapper.properties

# Gradle
.gradle/
gradle-app.setting
!gradle-wrapper.jar
.gradletasknamecache
local.properties

# Environment
.env
.env.*

# IDE / Editor
.vscode/
.idea/
*.iml
*.iws
.project
.classpath
.settings/

# OS
.DS_Store
Thumbs.db
`,

  go: `# Binaries
*.exe
*.exe~
*.dll
*.so
*.dylib

# Test binary
*.test

# Output
bin/
dist/

# Vendor (if not using modules)
vendor/

# Environment
.env
.env.*

# IDE / Editor
.vscode/
.idea/
*.swp

# OS
.DS_Store
Thumbs.db
`,

  rust: `# Compiled output
/target/
**/*.rs.bk

# Cargo lock (keep for binaries; add to .gitignore for libraries)
# Cargo.lock

# Environment
.env
.env.*

# IDE / Editor
.vscode/
.idea/
*.swp

# OS
.DS_Store
Thumbs.db
`,

  generic: `# Environment variables — NEVER commit secrets
.env
.env.*
.env.local

# Logs
*.log
logs/

# Build output
dist/
build/
out/

# IDE / Editor
.vscode/
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db
Desktop.ini

# Temp
*.tmp
*.temp
.cache/
`,
};

export function hasGitignore(cwd: string): boolean {
  return existsSync(join(cwd, '.gitignore'));
}

export function readGitignore(cwd: string): string {
  const path = join(cwd, '.gitignore');
  return existsSync(path) ? readFileSync(path, 'utf-8') : '';
}

export function writeGitignore(content: string, cwd: string): void {
  writeFileSync(join(cwd, '.gitignore'), content, 'utf-8');
}

export function getTemplate(type: ProjectType): string {
  return TEMPLATES[type];
}
