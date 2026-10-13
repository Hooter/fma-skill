import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const SKIP = new Set(['node_modules', 'dist', '.git']);

// Strips comments and blanks out the contents of strings and templates (the quotes stay) so that text inside
// them is not mistaken for code. Regular expression literals are not parsed.
export function stripComments(src) {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1];
    if (c === '/' && next === '/') {
      while (i < src.length && src[i] !== '\n') i++;
    } else if (c === '/' && next === '*') {
      const end = src.indexOf('*/', i + 2);
      i = end === -1 ? src.length : end + 2;
    } else if (c === '"' || c === "'" || c === '`') {
      out += c;
      i++;
      while (i < src.length && src[i] !== c) {
        if (src[i] === '\\') i++;
        else if (src[i] === '\n' && c !== '`') break;
        else out += src[i] === '\n' ? '\n' : ' ';
        i++;
      }
      if (src[i] === c) out += c;
      i++;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

export function findIndexFiles(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) findIndexFiles(full, acc);
    else if (/^index\.tsx?$/.test(entry.name)) acc.push(full);
  }
  return acc;
}

export function barrelViolations(dir) {
  const re = /^\s*export\s+(type\s+)?\*\s*(as\s+([\w$]+|'\s*'|"\s*")\s*)?from\b/m;
  return findIndexFiles(dir).filter((f) => re.test(stripComments(fs.readFileSync(f, 'utf8'))));
}

const NON_DOMAINS = new Set(['shared', 'contracts']);

const subdirs = (dir) =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !SKIP.has(d.name))
    .map((d) => path.join(dir, d.name));

const hasIndex = (dir) =>
  fs.existsSync(path.join(dir, 'index.ts')) || fs.existsSync(path.join(dir, 'index.tsx'));

// Modules: domains (all srcRoot folders except shared and contracts), their _submodules and the shared segments.
export function modulesWithoutIndex(srcRoot) {
  const modules = [];
  for (const dir of subdirs(srcRoot)) {
    const name = path.basename(dir);
    if (name === 'shared') modules.push(...subdirs(dir));
    else if (!NON_DOMAINS.has(name)) {
      modules.push(dir, ...subdirs(dir).filter((d) => path.basename(d).startsWith('_')));
    }
  }
  return modules.filter((dir) => !hasIndex(dir));
}

function exec(cmd, args, cwd, env) {
  // shell: true — on Windows the commands in node_modules/.bin are .cmd shims.
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', env, shell: true });
  return { code: r.status ?? 1, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

function section(title, result) {
  if (result.code === 0) return 0;
  console.error(`\n✘ ${title}\n${result.out.trim()}`);
  return 1;
}

// dependency-cruiser and Sheriff import the package named `typescript` and need the TypeScript 6 JS API
// (TypeScript 7.0 has no programmatic API; it is expected in 7.1).
export function typescriptProblem(version) {
  const major = Number.parseInt(version, 10);
  if (!(major >= 7)) return null;
  return (
    `TypeScript ${version} is installed under the name typescript: it has no JS API, so dependency-cruiser and Sheriff ` +
    'cannot check the code. Use aliases: "typescript": "npm:@typescript/typescript6@^6.0.2" ' +
    'and "@typescript/native": "npm:typescript@^7.0.2" (provides tsc 7).'
  );
}

export function resolveTypeScriptVersion(dir) {
  try {
    const pkg = createRequire(path.join(path.resolve(dir), 'package.json')).resolve(
      'typescript/package.json',
    );
    return JSON.parse(fs.readFileSync(pkg, 'utf8')).version;
  } catch {
    return undefined;
  }
}

// "(0 modules, 0 dependencies cruised)" means there was nothing to check.
export function parseCruisedModules(output) {
  const m = output.match(/(\d+) modules?\b/);
  return m ? Number(m[1]) : null;
}

// File-level linter: eslint (baseline profile) or oxlint (fast profile). The other checks are shared.
export const LINTERS = ['eslint', 'oxlint'];

export function runArchCheck({
  web,
  api,
  linter = 'eslint',
  eslintConfig,
  oxlintConfig,
  depcruiseConfig,
  env = process.env,
}) {
  if (!LINTERS.includes(linter)) {
    console.error(`
✘ unknown linter "${linter}": allowed values are ${LINTERS.join(' or ')} (--linter)`);
    return 1;
  }
  let failed = 0;
  for (const [label, dir] of [
    ['web', web],
    ['api', api],
  ]) {
    if (!dir) continue;
    const tsVersion = resolveTypeScriptVersion(dir);
    const tsProblem = tsVersion ? typescriptProblem(tsVersion) : null;
    if (tsProblem) {
      console.error(`\n✘ ${dir}: ${tsProblem}`);
      failed = 1;
    }
    const src = path.join(dir, 'src');
    const domainsRoot = label === 'web' ? path.join(src, 'app') : src;
    const noIndex = fs.existsSync(domainsRoot) ? modulesWithoutIndex(domainsRoot) : [];
    if (noIndex.length) {
      console.error(
        `\n✘ ${dir}: module has no index.ts (FMA)\n${noIndex.map((d) => `  ${d}`).join('\n')}`,
      );
      failed = 1;
    }
    const bad = barrelViolations(src);
    if (bad.length) {
      console.error(
        `\n✘ ${dir}: export * in index.ts (forbidden by FMA)\n${bad.map((f) => `  ${f}`).join('\n')}`,
      );
      failed = 1;
    }
    const lintConfig = linter === 'eslint' ? eslintConfig : oxlintConfig;
    failed |= section(
      `${dir}: ${linter}`,
      exec(linter, ['-c', JSON.stringify(lintConfig), JSON.stringify(src)], dir, env),
    );
    const cruiseEnv = label === 'web' ? { ...env, FMA_SRC_ROOT: 'src/app' } : env;
    const cruise = exec(
      'depcruise',
      ['src', '--config', JSON.stringify(depcruiseConfig)],
      dir,
      cruiseEnv,
    );
    if (cruise.code === 0 && parseCruisedModules(cruise.out) === 0) {
      // A green result with no modules at all usually means an incompatible TypeScript or an empty src.
      cruise.code = 1;
      cruise.out = `dependency-cruiser processed 0 modules: src is empty or TypeScript is incompatible (typescript 6.x is required).\n${cruise.out}`;
    }
    failed |= section(`${dir}: dependency-cruiser`, cruise);
    if (label === 'web') {
      failed |= section(`${dir}: sheriff`, exec('sheriff', ['verify', 'src/main.ts'], dir, env));
    }
  }
  if (!failed) console.log('arch:check: no violations');
  return failed ? 1 : 0;
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  const argv = process.argv.slice(2);
  const get = (flag, fallback) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? path.resolve(argv[i + 1]) : fallback;
  };
  const linterIndex = argv.indexOf('--linter');
  process.exit(
    runArchCheck({
      web: get('--web'),
      api: get('--api'),
      linter: linterIndex >= 0 ? argv[linterIndex + 1] : 'eslint',
      eslintConfig: get('--eslint-config', path.resolve('eslint.config.mjs')),
      oxlintConfig: get('--oxlint-config', path.resolve('.oxlintrc.json')),
      depcruiseConfig: get('--depcruise-config', path.resolve('.dependency-cruiser.cjs')),
    }),
  );
}
