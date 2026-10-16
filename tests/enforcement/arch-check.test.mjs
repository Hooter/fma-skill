import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, TEMPLATES, makeFixture } from './helpers.mjs';

const tsconfig = JSON.stringify({
  compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', baseUrl: '.' },
});
const sheriffCfg = fs.readFileSync(path.join(TEMPLATES, 'sheriff.config.ts'), 'utf8');
const env = { ...process.env, PATH: `${path.join(ROOT, 'node_modules/.bin')}${path.delimiter}${process.env.PATH}` };

function archCheck(files, flags) {
  const dir = makeFixture({
    'apps/web/tsconfig.json': tsconfig,
    'apps/web/sheriff.config.ts': sheriffCfg,
    'apps/api/tsconfig.json': tsconfig,
    ...files,
  });
  const args = [
    path.join(TEMPLATES, 'arch-check.mjs'),
    '--web', path.join(dir, 'apps/web'),
    '--api', path.join(dir, 'apps/api'),
    '--linter', 'oxlint',
    '--oxlint-config', path.join(TEMPLATES, 'oxlintrc.json'),
    '--depcruise-config', path.join(TEMPLATES, 'dependency-cruiser.cjs'),
    ...(flags ?? []),
  ];
  const r = spawnSync(process.execPath, args, { cwd: dir, encoding: 'utf8', env, shell: false });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

const cleanWeb = {
  'apps/web/src/main.ts': "import { A } from './app/a';\nexport const a = A;\n",
  'apps/web/src/app/a/index.ts': "export { A } from './a';\n",
  'apps/web/src/app/a/a.ts': 'export const A = 1;\n',
};
const cleanApi = {
  'apps/api/src/cart/index.ts': "export { CartService } from './cart.service';\n",
  'apps/api/src/cart/cart.service.ts': 'export class CartService {}\n',
};

test('a clean monorepo passes', () => {
  const r = archCheck({ ...cleanWeb, ...cleanApi });
  assert.equal(r.code, 0, r.out);
});

test('export * in index.ts is caught and reported', () => {
  const r = archCheck({ ...cleanWeb, ...cleanApi, 'apps/api/src/cart/index.ts': "export * from './cart.service';\n" });
  assert.notEqual(r.code, 0, r.out);
  assert.match(r.out, /export \*/);
});

test('a domain without index.ts is caught in web and in api (item 1)', () => {
  const web = archCheck({ ...cleanWeb, ...cleanApi, 'apps/web/src/app/b/b.ts': 'export const B = 1;\n' });
  assert.notEqual(web.code, 0, web.out);
  assert.match(web.out, /index\.ts/);
  const api = archCheck({ ...cleanWeb, ...cleanApi, 'apps/api/src/orders/orders.service.ts': 'export const o = 1;\n' });
  assert.notEqual(api.code, 0, api.out);
  assert.match(api.out, /orders/);
});

test('Angular: ui importing api is caught by the depcruise rules (item 4)', () => {
  const r = archCheck({
    ...cleanWeb,
    ...cleanApi,
    'apps/web/src/app/a/a.api.ts': 'export class AApi {}\n',
    'apps/web/src/app/a/ui/badge.ts': "import { AApi } from '../a.api';\nexport const b = AApi;\n",
  });
  assert.notEqual(r.code, 0, r.out);
  assert.match(r.out, /ui-no-data/);
});

test('a violation in api does not hide a violation in web: both are reported', () => {
  const r = archCheck({
    ...cleanWeb,
    ...cleanApi,
    'apps/web/src/app/a/index.ts': "export * from './a';\n",
    'apps/api/src/orders/orders.service.ts': "import { CartService } from '../cart/cart.service';\nexport const o = CartService;\n",
  });
  assert.notEqual(r.code, 0, r.out);
  assert.match(r.out, /apps[\\/]web/);
  assert.match(r.out, /no-deep-import/);
});

function archCheckEslint(files, extraFlags = []) {
  const dir = makeFixture({
    'apps/web/tsconfig.json': tsconfig,
    'apps/web/sheriff.config.ts': sheriffCfg,
    'apps/api/tsconfig.json': tsconfig,
    ...files,
  });
  const args = [
    path.join(TEMPLATES, 'arch-check.mjs'),
    '--web', path.join(dir, 'apps/web'),
    '--api', path.join(dir, 'apps/api'),
    '--eslint-config', path.join(TEMPLATES, 'eslint.config.mjs'),
    '--depcruise-config', path.join(TEMPLATES, 'dependency-cruiser.cjs'),
    ...extraFlags,
  ];
  const r = spawnSync(process.execPath, args, { cwd: dir, encoding: 'utf8', env, shell: false });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

test('the default linter is ESLint: a clean monorepo passes', () => {
  const r = archCheckEslint({ ...cleanWeb, ...cleanApi });
  assert.equal(r.code, 0, r.out);
});

test('the default linter is ESLint: forwardRef is caught by the no-restricted-imports rule', () => {
  const r = archCheckEslint({
    ...cleanWeb,
    ...cleanApi,
    'apps/api/src/cart/cart.module.ts': "import { forwardRef } from '@nestjs/common';\nexport const m = forwardRef;\n",
  });
  assert.notEqual(r.code, 0, r.out);
  assert.match(r.out, /no-restricted-imports/);
});

test('an unknown linter is an error with a hint', () => {
  const r = archCheckEslint({ ...cleanWeb, ...cleanApi }, ['--linter', 'tslint']);
  assert.notEqual(r.code, 0, r.out);
  assert.match(r.out, /eslint|oxlint/);
});

function archCheckApi(files, flags, { tsc = tsconfig } = {}) {
  const dir = makeFixture({ 'svc/tsconfig.json': tsc, 'svc/package.json': '{}', ...files });
  const args = [
    path.join(TEMPLATES, 'arch-check.mjs'),
    '--linter', 'oxlint',
    '--oxlint-config', path.join(TEMPLATES, 'oxlintrc.json'),
    '--depcruise-config', path.join(TEMPLATES, 'dependency-cruiser.cjs'),
    ...flags(dir),
  ];
  const r = spawnSync(process.execPath, args, { cwd: dir, encoding: 'utf8', env, shell: false });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

const nestWithCommon = {
  'svc/src/cart/index.ts': "export { CartService } from './cart.service';\n",
  'svc/src/cart/cart.service.ts': "import { fmt } from '../common/format';\nexport class CartService { f = fmt; }\n",
  'svc/src/common/format.ts': 'export const fmt = 1;\n',
};

test('--non-domains: infrastructure folders are not domains (no index.ts, deep import allowed)', () => {
  const strict = archCheckApi(nestWithCommon, (d) => ['--api', path.join(d, 'svc')]);
  assert.notEqual(strict.code, 0, strict.out);
  assert.match(strict.out, /common/);
  const ok = archCheckApi(nestWithCommon, (d) => ['--api', path.join(d, 'svc'), '--non-domains', 'common']);
  assert.equal(ok.code, 0, ok.out);
});

test('--api-root: domains under src/app (Nx Nest layout)', () => {
  const files = {
    'svc/src/main.ts': "import './app/cart';\n",
    'svc/src/app/cart/index.ts': "export { CartService } from './cart.service';\n",
    'svc/src/app/cart/cart.service.ts': 'export class CartService {}\n',
    'svc/src/app/orders/orders.service.ts': "import { CartService } from '../cart/cart.service';\nexport const o = CartService;\n",
  };
  const r = archCheckApi(files, (d) => ['--api', path.join(d, 'svc'), '--api-root', 'src/app']);
  assert.notEqual(r.code, 0, r.out);
  assert.match(r.out, /orders/);
  assert.match(r.out, /no-deep-import/);
});

test('--api is repeatable and --report keeps the exit code at 0', () => {
  const files = {
    'a/package.json': '{}',
    'a/tsconfig.json': tsconfig,
    'a/src/x/index.ts': "export * from './x';\n",
    'a/src/x/x.ts': 'export const x = 1;\n',
    'b/package.json': '{}',
    'b/tsconfig.json': tsconfig,
    'b/src/y/y.ts': 'export const y = 1;\n',
  };
  const flags = (d) => ['--api', path.join(d, 'a'), '--api', path.join(d, 'b')];
  const strict = archCheckApi(files, flags);
  assert.notEqual(strict.code, 0, strict.out);
  assert.match(strict.out, /export \*/);
  assert.match(strict.out, /module has no index\.ts/);
  const report = archCheckApi(files, (d) => [...flags(d), '--report']);
  assert.equal(report.code, 0, report.out);
  assert.match(report.out, /export \*/);
});

test('--services: per-service root, non-domains and tsconfig', () => {
  const files = {
    ...nestWithCommon,
    'svc/tsconfig.app.json': tsconfig,
    'svc.json': '[{ "api": "svc", "nonDomains": ["common"], "tsconfig": "tsconfig.app.json" }]',
  };
  const r = archCheckApi(files, (d) => ['--services', path.join(d, 'svc.json')]);
  assert.equal(r.code, 0, r.out);
});

test('FMA_TSCONFIG via --tsconfig resolves aliases of a service without tsconfig.json', () => {
  const tscAlias = JSON.stringify({
    compilerOptions: { module: 'ESNext', moduleResolution: 'Bundler', baseUrl: '.', paths: { '@app/*': ['src/*'] } },
  });
  const files = {
    'svc/src/cart/index.ts': "export { CartService } from './cart.service';\n",
    'svc/src/cart/cart.service.ts': 'export class CartService {}\n',
    'svc/src/orders/index.ts': "export { O } from './o';\n",
    'svc/src/orders/o.ts': "import { CartService } from '@app/cart/cart.service';\nexport const O = CartService;\n",
    'svc/tsconfig.app.json': tscAlias,
  };
  const rm = (d) => ['--api', path.join(d, 'svc')];
  const without = archCheckApi({ ...files }, rm, { tsc: '{}' });
  const withCfg = archCheckApi({ ...files }, (d) => [...rm(d), '--tsconfig', 'tsconfig.app.json'], { tsc: '{}' });
  assert.equal(without.code === 0 && /no-deep-import/.test(without.out), false, without.out);
  assert.notEqual(withCfg.code, 0, withCfg.out);
  assert.match(withCfg.out, /no-deep-import/);
});
