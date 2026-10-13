import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const ROOT = path.resolve(import.meta.dirname, '../..');
export const TEMPLATES = path.join(ROOT, 'skills/fma/templates');

export function binPath(pkg, bin = pkg.split('/').pop()) {
  const pj = path.join(ROOT, 'node_modules', pkg, 'package.json');
  const meta = JSON.parse(fs.readFileSync(pj, 'utf8'));
  const rel = typeof meta.bin === 'string' ? meta.bin : meta.bin[bin];
  if (!rel) throw new Error(`package ${pkg} has no bin "${bin}"`);
  return path.join(path.dirname(pj), rel);
}

export function makeFixture(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fma-fx-'));
  for (const [rel, content] of Object.entries(files)) {
    const p = path.join(dir, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
  }
  return dir;
}

export function run(file, args, cwd, env = {}) {
  const r = spawnSync(process.execPath, [file, ...args], { cwd, encoding: 'utf8', env: { ...process.env, ...env } });
  return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}
