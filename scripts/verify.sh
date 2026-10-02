#!/usr/bin/env bash
# Deterministic, non-installing project gate. Product scripts must be finite and
# use isolated fixtures; never hide failures with --passWithNoTests or || true.
set -euo pipefail
project_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_root"
export CI=true TZ=Asia/Kolkata NEXT_TELEMETRY_DISABLED=1
export DEMO_TODAY="${DEMO_TODAY:-2026-10-04}"
export LLM_OFFLINE=true
export PIP_NO_INDEX=1 GOPROXY=off GOSUMDB=off GOTOOLCHAIN=local
run() { printf '\n[verify]'; printf ' %q' "$@"; printf '\n'; "$@"; }
require() { command -v "$1" >/dev/null 2>&1 || { printf '[verify] Required tool missing: %s\n' "$1" >&2; exit 1; }; }
shopt -s nullglob globstar
for script in scripts/**/*.sh; do run bash -n "$script"; done
manifest_found=false
if [[ -f package.json ]]; then
  manifest_found=true
  require node
  node <<'NODE'
const fs = require('node:fs');
const {spawnSync} = require('node:child_process');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const scripts = pkg.scripts || {};
const deps = {...pkg.dependencies, ...pkg.devDependencies};
const exists = (...paths) => paths.some(p => fs.existsSync(p));
const fail = message => { console.error(`[verify] ${message}`); process.exit(1); };
const lockFamilies = [
  ['npm', exists('package-lock.json', 'npm-shrinkwrap.json')],
  ['pnpm', exists('pnpm-lock.yaml')],
  ['yarn', exists('yarn.lock')],
  ['bun', exists('bun.lock', 'bun.lockb')],
].filter(([, present]) => present).map(([name]) => name);
if (lockFamilies.length > 1) fail('Conflicting package-manager lockfiles.');
const declared = pkg.packageManager?.split('@')[0];
if (declared && !['npm', 'pnpm', 'yarn', 'bun'].includes(declared)) fail('Unsupported packageManager.');
if (declared && lockFamilies.length && declared !== lockFamilies[0]) fail('packageManager conflicts with lockfile.');
const manager = declared || lockFamilies[0] || 'npm';
function run(command, args) {
  console.log(`\n[verify] ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, {stdio: 'inherit', env: process.env});
  if (result.error) fail(`Unable to execute ${command}: ${result.error.message}`);
  if (result.status !== 0) fail(`${command} failed (${result.signal || result.status}).`);
}
function local(bin, args) {
  const path = `node_modules/.bin/${bin}`;
  if (!exists(path)) fail(`Missing installed ${bin}; install locked project dependencies first.`);
  run(path, args);
}
function script(name, args = []) {
  if (name === 'verify' || /scripts\/verify\.sh/.test(scripts[name])) fail(`Recursive verification script: ${name}`);
  run(manager, ['run', name, ...(args.length && manager === 'npm' ? ['--'] : []), ...args]);
}
function choose(names) { return names.find(name => typeof scripts[name] === 'string'); }
const configs = prefixes => fs.readdirSync('.').some(name => prefixes.some(prefix => name.startsWith(prefix)));
let checks = 0;
function check(names, fallback) {
  const name = choose(names);
  if (name) { script(name); checks++; return true; }
  if (fallback) { fallback(); checks++; return true; }
  return false;
}
if (exists('prisma/schema.prisma')) {
  local('prisma', ['validate']);
  local('prisma', ['generate']);
  checks++;
}
const eslint = configs(['eslint.config.', '.eslintrc']) || pkg.eslintConfig || deps.eslint;
check(['lint'], eslint ? () => local('eslint', ['.']) : null);
const prettier = configs(['.prettierrc', 'prettier.config.']) || pkg.prettier || deps.prettier;
check(['format:check', 'check:format'], prettier ? () => local('prettier', ['--check', '.']) : null);
check(['typecheck', 'type-check', 'check:types'], exists('tsconfig.json') ? () => local('tsc', ['--noEmit']) : null);
const testName = choose(['test:ci', 'test']);
if (testName) {
  const command = scripts[testName];
  if (/--watch(?:All)?(?:\s|=|$)|\bvitest\s+watch\b/.test(command)) fail('Test script must be non-watch.');
  script(testName, /\bvitest\b/.test(command) && !/\b(run|--run)\b/.test(command) ? ['--run'] : []);
  checks++;
} else if (deps.vitest || configs(['vitest.config.'])) { local('vitest', ['run']); checks++; }
else if (deps.jest || configs(['jest.config.'])) { local('jest', ['--runInBand']); checks++; }
else if (exists('test', 'tests', 'src/tests')) fail('Tests exist but no supported test script/runner is configured.');
check(['build'], deps.next ? () => local('next', ['build']) : deps.vite ? () => local('vite', ['build']) : null);
const e2e = choose(['test:e2e', 'e2e']);
if (e2e) { script(e2e); checks++; }
else if (configs(['playwright.config.'])) { local('playwright', ['test']); checks++; }
if (!checks) fail('package.json exists but no quality checks are configured.');

NODE
fi
if [[ -f pyproject.toml || -f setup.cfg || -f setup.py || -f requirements.txt || -f tox.ini || -f pytest.ini ]]; then
  manifest_found=true
  require python3
  python3 <<'PY'
import pathlib, subprocess, sys, configparser
root = pathlib.Path('.')
config = {}
if (root / 'pyproject.toml').exists():
    import tomllib
    config = tomllib.loads((root / 'pyproject.toml').read_text())
tool = config.get('tool', {})
ini = configparser.ConfigParser()
ini.read(['setup.cfg', 'tox.ini', 'pytest.ini'])
def run(*args):
    print('\n[verify] ' + ' '.join(args), flush=True)
    subprocess.run(args, check=True)
checks = 0
for name, args in [('ruff', ['check', '.']), ('black', ['--check', '.']),
                   ('isort', ['--check-only', '.']), ('mypy', ['.'])]:
    if name in tool or ini.has_section(name) or (name == 'ruff' and any((root / p).exists() for p in ['ruff.toml', '.ruff.toml'])) or (name == 'mypy' and (root / 'mypy.ini').exists()):
        run(sys.executable, '-m', name, *args)
        checks += 1
if 'pytest' in tool or (root / 'pytest.ini').exists() or ini.has_section('tool:pytest') or ini.has_section('pytest') or (root / 'tests').exists() or list(root.glob('test_*.py')):
    run(sys.executable, '-m', 'pytest')
    checks += 1
if ini.has_section('tox') or 'tox' in tool:
    run(sys.executable, '-m', 'tox')
    checks += 1
if 'build-system' in config:
    run(sys.executable, '-m', 'build', '--no-isolation')
    checks += 1
if not checks:
    raise SystemExit('[verify] Python manifest exists but no quality checks are configured.')
PY
fi
if [[ -f go.mod ]]; then
  manifest_found=true
  require go
  require gofmt
  run go vet ./...
  run go test ./...
  run go build ./...
  unformatted="$(gofmt -l .)"
  if [[ -n "$unformatted" ]]; then printf '[verify] Unformatted Go files:\n%s\n' "$unformatted" >&2; exit 1; fi
fi
if [[ -f Cargo.toml ]]; then
  manifest_found=true
  require cargo
  run cargo fmt --all -- --check
  run cargo clippy --offline --locked --all-targets --all-features -- -D warnings
  run cargo test --offline --locked --all-features
  run cargo build --offline --locked --all-features
fi
if [[ "$manifest_found" == false ]]; then
  printf '\n[verify] No product manifest yet; planning/shell validation only.\n'
fi
printf '\n[verify] PASS\n'
