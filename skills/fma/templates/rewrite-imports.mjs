// Moves files and rewrites the imports that point to them, so a domain can be reorganized mechanically.
// Usage: node tools/rewrite-imports.mjs <moves.json> [--root <dir>] [--dry-run]
// moves.json: { "moves": { "src/old/a.ts": "src/new/a.ts", "src/legacy/": "src/billing/" },
//               "aliases": { "@app/": "src/" } }
// A key that ends with "/" moves a whole folder. Relative imports and the listed aliases are rewritten; other
// specifiers (packages, unknown aliases) are left alone. Line endings of every file are preserved (CRLF stays CRLF).
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SKIP = new Set(['node_modules', 'dist', '.git']);
const EXTS = ['.ts', '.tsx'];
const SPECIFIER = /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)(['"])([^'"\n]+)\2/g;

const posix = (p) => p.split(path.sep).join('/');

export function listSources(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) listSources(full, acc);
    else if (EXTS.includes(path.extname(e.name))) acc.push(full);
  }
  return acc;
}

// Returns a function old absolute path -> new absolute path (identity for files that do not move).
export function makeMover(root, moves) {
  const entries = Object.entries(moves).map(([from, to]) => [
    path.resolve(root, from),
    path.resolve(root, to),
    from.endsWith('/'),
  ]);
  return (abs) => {
    for (const [from, to, isDir] of entries) {
      if (abs === from) return to;
      if (isDir && abs.startsWith(from + path.sep))
        return path.join(to, abs.slice(from.length + 1));
    }
    return abs;
  };
}

function resolveTarget(base, files) {
  for (const cand of [
    base,
    ...EXTS.map((e) => base + e),
    ...EXTS.map((e) => path.join(base, 'index' + e)),
  ]) {
    if (files.has(cand)) return cand;
  }
  return null;
}

// "./a/index" and "./a" both stay in the style the author used; the extension is never added.
function specifierFor(spec, targetNew, fromDirNew) {
  const hadIndex = /\/index$/.test(spec);
  let rel = path.relative(fromDirNew, targetNew.replace(/\.tsx?$/, ''));
  if (!hadIndex) rel = rel.replace(/[\\/]index$/, '');
  rel = posix(rel) || '.';
  return rel.startsWith('.') ? rel : `./${rel}`;
}

export function rewriteSource(text, { file, newFile, files, move, root, aliases = {} }) {
  const fromDirNew = path.dirname(newFile);
  let changed = 0;
  const out = text.replace(SPECIFIER, (all, head, quote, spec) => {
    let base;
    let alias;
    if (spec.startsWith('.')) base = path.resolve(path.dirname(file), spec);
    else {
      alias = Object.keys(aliases).find((a) => spec.startsWith(a));
      if (alias === undefined) return all;
      base = path.resolve(root, aliases[alias], spec.slice(alias.length));
    }
    const target = resolveTarget(base, files);
    if (!target) return all;
    const targetNew = move(target);
    if (targetNew === target && newFile === file) return all;
    let next;
    if (alias !== undefined) {
      const dir = path.resolve(root, aliases[alias]);
      const relToAlias = path.relative(dir, targetNew.replace(/\.tsx?$/, ''));
      if (relToAlias.startsWith('..')) return all; // left the alias folder: decide by hand
      next = alias + posix(relToAlias).replace(/\/index$/, '');
    } else next = specifierFor(spec, targetNew, fromDirNew);
    if (next === spec) return all;
    changed++;
    return `${head}${quote}${next}${quote}`;
  });
  return { text: out, changed };
}

export function applyMoves(root, config, { dryRun = false } = {}) {
  const moves = config.moves ?? {};
  const aliases = config.aliases ?? {};
  const move = makeMover(root, moves);
  const sources = listSources(root);
  const files = new Set(sources);
  const report = { moved: 0, rewritten: 0 };
  for (const file of sources) {
    const newFile = move(file);
    const text = fs.readFileSync(file, 'utf8');
    const res = rewriteSource(text, { file, newFile, files, move, root, aliases });
    if (res.changed) report.rewritten++;
    if (newFile === file && !res.changed) continue;
    if (dryRun) {
      console.log(
        `${newFile === file ? 'edit' : 'move'} ${posix(path.relative(root, file))}${newFile === file ? '' : ` -> ${posix(path.relative(root, newFile))}`}`,
      );
    } else {
      fs.mkdirSync(path.dirname(newFile), { recursive: true });
      fs.writeFileSync(newFile, res.text);
      if (newFile !== file) fs.rmSync(file);
    }
    if (newFile !== file) report.moved++;
  }
  return report;
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  const argv = process.argv.slice(2);
  const flag = (name) => argv[argv.indexOf(name) + 1];
  const mapFile = argv.find((a) => !a.startsWith('--') && a !== flag('--root'));
  if (!mapFile) {
    console.error('usage: node rewrite-imports.mjs <moves.json> [--root <dir>] [--dry-run]');
    process.exit(2);
  }
  const root = path.resolve(argv.includes('--root') ? flag('--root') : '.');
  const r = applyMoves(root, JSON.parse(fs.readFileSync(mapFile, 'utf8')), {
    dryRun: argv.includes('--dry-run'),
  });
  console.log(
    `rewrite-imports: ${r.moved} files moved, ${r.rewritten} files with rewritten imports`,
  );
}
