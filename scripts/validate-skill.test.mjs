import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseFrontmatter, codeFences, checkSkillMd, checkChecklist,
  checkMatrix, checkReferences, checkHeadings, checkNoStarExports,
} from './validate-skill.mjs';

const fm = (desc, name = 'fma') => `---\nname: ${name}\ndescription: ${desc}\n---\n`;
const goodDesc = 'FMA for Angular and NestJS: domains, facade, tiers';

test('parseFrontmatter reads name and description', () => {
  assert.deepEqual(parseFrontmatter(fm('abc')), { name: 'fma', description: 'abc' });
  assert.equal(parseFrontmatter('# no frontmatter'), null);
});

test('codeFences returns the contents of code blocks', () => {
  const t = 'a\n```ts\nconst x = 1;\n```\nb\n```\nplain\n```\n';
  assert.deepEqual(codeFences(t), ['const x = 1;\n', 'plain\n']);
});

test('checkSkillMd: a valid file passes', () => {
  assert.deepEqual(checkSkillMd(fm(goodDesc) + '# FMA\n'), []);
});

test('checkSkillMd: wrong name, no triggers, more than 200 lines', () => {
  const errs = checkSkillMd(fm('just text', 'other') + 'x\n'.repeat(250));
  assert.ok(errs.some((e) => e.includes('name')));
  assert.ok(errs.some((e) => e.includes('Angular')));
  assert.ok(errs.some((e) => e.includes('200')));
});

test('checkChecklist: exactly 14 items', () => {
  const items = (n) => Array.from({ length: n }, (_, i) => `${i + 1}. item`).join('\n');
  assert.deepEqual(checkChecklist(`## Checklist\n${items(14)}\n\n## Next\n1. not counted`), []);
  assert.equal(checkChecklist(`## Checklist\n${items(13)}\n`).length, 1);
  assert.equal(checkChecklist('no section').length, 1);
});

test('checkMatrix: the header contains all layers', () => {
  const ok = '| From ↓ / To → | ui | state | api | model | repo | domain | port | shared | contracts |';
  assert.deepEqual(checkMatrix(ok), []);
  assert.equal(checkMatrix('| From ↓ / To → | ui | state |').length, 1);
});

test('checkReferences: every mentioned references/*.md exists', () => {
  const text = 'see references/angular.md and references/nestjs.md';
  assert.deepEqual(checkReferences(text, () => true), []);
  const errs = checkReferences(text, (rel) => rel !== 'references/nestjs.md');
  assert.equal(errs.length, 1);
  assert.match(errs[0], /nestjs\.md/);
});

test('checkHeadings: reports missing headings', () => {
  const errs = checkHeadings('references/angular.md', '## Domain structure\n');
  assert.ok(errs.some((e) => e.includes('## Rules')));
  assert.ok(errs.some((e) => e.includes('## Tests')));
  assert.deepEqual(checkHeadings('references/angular.md', '## Domain structure\n## Rules\n## Tests\n'), []);
});

test('checkNoStarExports: export * in code blocks is forbidden, in prose it is allowed', () => {
  assert.deepEqual(checkNoStarExports('a.md', 'do not write export * from x\n'), []);
  assert.equal(checkNoStarExports('a.md', '```ts\nexport * from "./x";\n```\n').length, 1);
  assert.equal(checkNoStarExports('a.md', '```ts\nexport * as ns from "./x";\n```\n').length, 1);
});

import { checkSnippets } from './validate-skill.mjs';

test('checkSnippets: nestjs.md must export Module and Facade from index.ts', () => {
  const good = 'export { CartModule } from \'./cart.module\';\nexport { CartFacade } from \'./cart.facade\';\n';
  assert.deepEqual(checkSnippets('references/nestjs.md', good), []);
  const errs = checkSnippets('references/nestjs.md', 'export type { X } from "y";\n');
  assert.ok(errs.some((e) => e.includes('CartModule')));
  assert.ok(errs.some((e) => e.includes('CartFacade')));
});

test('checkSnippets: outdated claims are forbidden', () => {
  const errs = checkSnippets('references/nestjs.md', 'provider classes are not exported\nexport { CartModule }\nexport { CartFacade }\n');
  assert.ok(errs.some((e) => e.includes('provider classes are not exported')));
  const ng = checkSnippets('references/angular.md', "import type { Cart } from './domain/cart';\n");
  assert.ok(ng.some((e) => e.includes("from './domain/")));
});

test('checkSnippets: transport.md links the EventPublisher port with the outbox', () => {
  const errs = checkSnippets('references/transport.md', 'EventPublisher and outbox separately\n');
  assert.ok(errs.some((e) => e.includes('OutboxEventPublisher')));
  assert.ok(errs.some((e) => e.includes('KafkaEventPublisher')));
  assert.deepEqual(checkSnippets('references/transport.md', 'OutboxEventPublisher, KafkaEventPublisher, shared/events\n'), []);
});

test('checkSnippets: SKILL.md distinguishes infrastructure and domain ports', () => {
  const errs = checkSnippets('SKILL.md', 'ports without distinction\n');
  assert.ok(errs.some((e) => e.includes('infrastructure port')));
  assert.ok(errs.some((e) => e.includes('domain port')));
  assert.deepEqual(
    checkSnippets('SKILL.md', 'infrastructure port and domain port and every layer of the domain may import `types.ts`\n'),
    [],
  );
});

test('checkSnippets: transport.md places EventPublisher in shared/events', () => {
  const errs = checkSnippets('references/transport.md', 'OutboxEventPublisher KafkaEventPublisher\n');
  assert.ok(errs.some((e) => e.includes('shared/events')));
});

test('checkSnippets: enforcement.md describes the TypeScript 6/7 aliases', () => {
  const errs = checkSnippets('references/enforcement.md', 'typescript ^6\n');
  assert.ok(errs.some((e) => e.includes('@typescript/typescript6')));
  assert.ok(errs.some((e) => e.includes('@typescript/native')));
  assert.deepEqual(
    checkSnippets(
      'references/enforcement.md',
      '@typescript/typescript6 @typescript/native path mapping Baseline profile Fast profile ESLint Prettier oxlint oxfmt\n',
    ),
    [],
  );
});

test('checkSnippets: SKILL.md explains that types.ts is available to all layers of a domain', () => {
  const errs = checkSnippets('SKILL.md', 'infrastructure port domain port\n');
  assert.ok(errs.some((e) => e.includes('catalog.types.ts') || e.includes('types.ts')));
  assert.deepEqual(
    checkSnippets('SKILL.md', 'infrastructure port domain port every layer of the domain may import `types.ts`\n'),
    [],
  );
});

test('checkSnippets: enforcement.md warns about aliases to nonexistent folders', () => {
  const errs = checkSnippets('references/enforcement.md', '@typescript/typescript6 @typescript/native\n');
  assert.ok(errs.some((e) => e.includes('path mapping')));
});

test('checkSnippets: enforcement.md describes the baseline and fast profiles', () => {
  const errs = checkSnippets('references/enforcement.md', '@typescript/typescript6 @typescript/native path mapping\n');
  for (const s of ['Baseline profile', 'Fast profile', 'ESLint', 'Prettier', 'oxlint', 'oxfmt']) {
    assert.ok(errs.some((e) => e.includes(s)), `no requirement for "${s}"`);
  }
  const banned = checkSnippets(
    'references/enforcement.md',
    'Baseline profile Fast profile ESLint Prettier oxlint oxfmt @typescript/typescript6 @typescript/native path mapping\nESLint and Prettier are not used\n',
  );
  assert.ok(banned.some((e) => e.includes('ESLint and Prettier are not used')));
});
