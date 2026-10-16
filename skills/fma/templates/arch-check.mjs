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

// Root folders that are never domains. Projects add their own infrastructure folders (common, config, database,
// migrations, app) through `nonDomains` / --non-domains.
const NON_DOMAINS = ['shared', 'contracts'];

const subdirs = (dir) =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !SKIP.has(d.name))
    .map((d) => path.join(dir, d.name));

const hasIndex = (dir) =>
  fs.existsSync(path.join(dir, 'index.ts')) || fs.existsSync(path.join(dir, 'index.tsx'));

// Modules: domains (all srcRoot folders except shared, contracts and `nonDomains`), their _submodules and the
// shared segments.
export function modulesWithoutIndex(srcRoot, nonDomains = []) {
  const skip = new Set([...NON_DOMAINS, ...nonDomains]);
  const modules = [];
  for (const dir of subdirs(srcRoot)) {
    const name = path.basename(dir);
    if (name === 'shared') modules.push(...subdirs(dir));
    else if (!skip.has(name)) {
      modules.push(dir, ...subdirs(dir).filter((d) => path.basename(d).startsWith('_')));
    }
  }
  return modules.filter((dir) => !hasIndex(dir));
}

function exec(cmd, args, cwd, env) {
  // shell: true — on Windows the commands in node_modules/.bin are .cmd shims.
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', env, shell: true });
  return { code: r.status ?? 1, out: `${r.stdout ?? ''}${r.stderr ?? ''}`, stdout: r.stdout ?? '' };
}

// Names listed by the import or export statement of `text` that has the given specifier.
export function importedNames(text, specifier) {
  const esc = specifier.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  const re = new RegExp(
    `(?:import|export)\\s+(?:type\\s+)?([^;]*?)\\s*from\\s*['"]${esc}['"]`,
    'g',
  );
  const names = [];
  for (const m of text.matchAll(re)) {
    const inner = m[1].replace(/[{}]/g, ' ');
    for (const part of inner.split(',')) {
      const name = part
        .trim()
        .replace(/^type\s+/, '')
        .split(/\s+as\s+/)[0]
        .trim();
      if (name) names.push(name);
    }
  }
  return [...new Set(names)];
}

// Each cycle of the dependency-cruiser JSON report once, as arcs: what is imported along every step
// (a value, or a type only) and the imported names. `read` returns the text of a file or undefined.
export function cycleArcs(report, read = () => undefined) {
  const byName = new Map(report.modules.map((m) => [m.source, m]));
  const seen = new Set();
  const cycles = [];
  for (const v of report.summary?.violations ?? []) {
    if (v.type !== 'cycle' || !v.cycle?.length) continue;
    const members = [v.from, ...v.cycle.map((c) => c.name)];
    const key = [...new Set(members)].sort().join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    const arcs = [];
    let prev = v.from;
    for (const [i, step] of v.cycle.entries()) {
      const dep = byName.get(prev)?.dependencies.find((d) => d.resolved === step.name);
      const specifier = i === 0 ? (v.unresolvedTo ?? dep?.module) : dep?.module;
      const text = read(prev);
      const names = text && specifier ? importedNames(text, specifier) : [];
      arcs.push({
        from: prev,
        to: step.name,
        kind: step.dependencyTypes.includes('type-only') ? 'type' : 'value',
        names,
      });
      prev = step.name;
    }
    cycles.push({ rule: v.rule.name, arcs });
  }
  return cycles;
}

export function formatCycles(cycles) {
  return cycles
    .map(
      (c) =>
        `cycle (${c.rule}):\n` +
        c.arcs
          .map(
            (a) =>
              `  ${a.from} → ${a.to}  [${a.kind}]${a.names.length ? `  ${a.names.join(', ')}` : ''}`,
          )
          .join('\n') +
        '\n  A cycle held by a type or a value that sits in the wrong module is fixed by moving it to the owner (types.ts) or to shared/<segment>; a facade or a port is for a real two-way dependency.',
    )
    .join('\n');
}

// Summary for --json: violations per rule and the pairs behind them.
export function summarizeViolations(report) {
  return (report.summary?.violations ?? []).map((v) => ({
    rule: v.rule.name,
    from: v.from,
    to: v.to,
  }));
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

// Source files that dependency-cruiser must have seen (specs are excluded by the template).
export function countSourceFiles(dir, acc = { n: 0 }) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) countSourceFiles(full, acc);
    else if (/\.tsx?$/.test(entry.name) && !/\.(spec|test)\.tsx?$/.test(entry.name)) acc.n++;
  }
  return acc.n;
}

// File-level linter: eslint (baseline profile) or oxlint (fast profile). The other checks are shared.
export const LINTERS = ['eslint', 'oxlint'];

const posix = (p) => p.split(path.sep).join('/');

// Targets: the single `web` / `api` apps, a repeatable `api` list, and `services` entries
// ({ api | web: dir, root?, nonDomains?, tsconfig? }) for monorepos whose services differ.
export function buildTargets({
  web,
  api,
  services = [],
  webRoot = 'src/app',
  apiRoot = 'src',
  nonDomains = [],
  infraDirs = [],
  tsconfig,
  sheriff = true,
}) {
  const base = { nonDomains, infraDirs, tsconfig, sheriff };
  const targets = [];
  if (web) targets.push({ ...base, label: 'web', dir: web, root: webRoot });
  for (const dir of [api ?? []].flat()) {
    targets.push({ ...base, label: 'api', dir, root: apiRoot });
  }
  for (const s of services) {
    const label = s.web ? 'web' : 'api';
    targets.push({
      label,
      dir: path.resolve(s.web ?? s.api),
      root: s.root ?? (label === 'web' ? webRoot : apiRoot),
      nonDomains: [...nonDomains, ...(s.nonDomains ?? [])],
      infraDirs: [...infraDirs, ...(s.infraDirs ?? [])],
      tsconfig: s.tsconfig ?? tsconfig,
      sheriff: s.sheriff ?? sheriff,
    });
  }
  return targets;
}

export function runArchCheck({
  web,
  api,
  services,
  webRoot,
  apiRoot,
  nonDomains,
  infraDirs,
  tsconfig,
  sheriff,
  report = false,
  json,
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
  const summary = { targets: [] };
  const targets = buildTargets({
    web,
    api,
    services,
    webRoot,
    apiRoot,
    nonDomains,
    infraDirs,
    tsconfig,
    sheriff,
  });
  for (const {
    label,
    dir,
    root,
    nonDomains: extra,
    infraDirs: infra,
    tsconfig: tsc,
    sheriff: useSheriff,
  } of targets) {
    const found = [];
    summary.targets.push({ dir, label, violations: found });
    const tsVersion = resolveTypeScriptVersion(dir);
    const tsProblem = tsVersion ? typescriptProblem(tsVersion) : null;
    if (tsProblem) {
      console.error(`\n✘ ${dir}: ${tsProblem}`);
      found.push({ rule: 'typescript-api', from: dir });
      failed = 1;
    }
    const src = path.join(dir, 'src');
    const domainsRoot = path.join(dir, root);
    const noIndex = fs.existsSync(domainsRoot) ? modulesWithoutIndex(domainsRoot, extra) : [];
    if (noIndex.length) {
      console.error(
        `\n✘ ${dir}: module has no index.ts (FMA)\n${noIndex.map((d) => `  ${d}`).join('\n')}`,
      );
      noIndex.forEach((d) => found.push({ rule: 'module-has-index', from: d }));
      failed = 1;
    }
    const bad = barrelViolations(src);
    if (bad.length) {
      console.error(
        `\n✘ ${dir}: export * in index.ts (forbidden by FMA)\n${bad.map((f) => `  ${f}`).join('\n')}`,
      );
      bad.forEach((f) => found.push({ rule: 'no-star-export', from: f }));
      failed = 1;
    }
    const lintConfig = linter === 'eslint' ? eslintConfig : oxlintConfig;
    failed |= section(
      `${dir}: ${linter}`,
      exec(linter, ['-c', JSON.stringify(lintConfig), JSON.stringify(src)], dir, env),
    );
    const cruiseEnv = {
      ...env,
      FMA_SRC_ROOT: posix(root),
      FMA_APP: label,
      ...(extra?.length ? { FMA_NON_DOMAINS: extra.join(',') } : {}),
      ...(infra?.length ? { FMA_INFRA_DIRS: infra.join(',') } : {}),
      ...(tsc ? { FMA_TSCONFIG: path.resolve(dir, tsc) } : {}),
    };
    const cruise = exec(
      'depcruise',
      ['src', '--config', JSON.stringify(depcruiseConfig)],
      dir,
      cruiseEnv,
    );
    const cruised = parseCruisedModules(cruise.out);
    const expected = fs.existsSync(src) ? countSourceFiles(src) : 0;
    if (cruise.code === 0 && cruised === 0) {
      // A green result with no modules at all usually means an incompatible TypeScript or an empty src.
      cruise.code = 1;
      cruise.out = `dependency-cruiser processed 0 modules: src is empty or TypeScript is incompatible (typescript 6.x is required).\n${cruise.out}`;
    } else if (cruise.code === 0 && cruised !== null && cruised < expected) {
      // npx in a folder without package.json runs in the nearest parent and silently checks someone else's code.
      cruise.code = 1;
      cruise.out = `dependency-cruiser processed ${cruised} modules but ${dir}/src has ${expected} source files: it probably ran in another folder (add a package.json or install dependency-cruiser in this one).\n${cruise.out}`;
    }
    if (cruise.code !== 0 || json) {
      // Second run with the JSON report: what travels along every arc of a cycle, and the summary for --json.
      const raw = exec(
        'depcruise',
        ['src', '--config', JSON.stringify(depcruiseConfig), '--output-type', 'json'],
        dir,
        cruiseEnv,
      );
      try {
        const rep = JSON.parse(raw.stdout);
        found.push(...summarizeViolations(rep));
        const cycles = cycleArcs(rep, (f) => {
          try {
            return fs.readFileSync(path.join(dir, f), 'utf8');
          } catch {
            return undefined;
          }
        });
        if (cycles.length && cruise.code !== 0) cruise.out += `\n${formatCycles(cycles)}`;
      } catch {
        // The text report above is still shown.
      }
    }
    failed |= section(`${dir}: dependency-cruiser`, cruise);
    if (label === 'web' && useSheriff) {
      failed |= section(`${dir}: sheriff`, exec('sheriff', ['verify', 'src/main.ts'], dir, env));
    }
  }
  if (json) {
    for (const t of summary.targets) {
      t.counts = {};
      for (const v of t.violations) t.counts[v.rule] = (t.counts[v.rule] ?? 0) + 1;
    }
    summary.total = summary.targets.reduce((n, t) => n + t.violations.length, 0);
    fs.writeFileSync(json, `${JSON.stringify(summary, null, 2)}\n`);
  }
  if (!failed) console.log('arch:check: no violations');
  else if (report) console.log('\narch:check (--report): violations are listed above, exit code 0');
  return failed && !report ? 1 : 0;
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  const argv = process.argv.slice(2);
  const all = (flag) => argv.flatMap((a, i) => (a === flag && argv[i + 1] ? [argv[i + 1]] : []));
  const one = (flag, fallback) => all(flag)[0] ?? fallback;
  const file = (flag, fallback) => (one(flag) ? path.resolve(one(flag)) : fallback);
  const servicesFile = file('--services');
  process.exit(
    runArchCheck({
      web: file('--web'),
      api: all('--api').map((d) => path.resolve(d)),
      services: servicesFile ? JSON.parse(fs.readFileSync(servicesFile, 'utf8')) : [],
      webRoot: one('--web-root'),
      apiRoot: one('--api-root'),
      nonDomains: (one('--non-domains', process.env.FMA_NON_DOMAINS ?? '') ?? '')
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean),
      infraDirs: (one('--infra-dirs', process.env.FMA_INFRA_DIRS ?? '') ?? '')
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean),
      tsconfig: one('--tsconfig', process.env.FMA_TSCONFIG),
      sheriff: !argv.includes('--no-sheriff'),
      report: argv.includes('--report'),
      json: file('--json'),
      linter: one('--linter', 'eslint'),
      eslintConfig: file('--eslint-config', path.resolve('eslint.config.mjs')),
      oxlintConfig: file('--oxlint-config', path.resolve('.oxlintrc.json')),
      depcruiseConfig: file('--depcruise-config', path.resolve('.dependency-cruiser.cjs')),
    }),
  );
}
