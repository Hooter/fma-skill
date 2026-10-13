import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const LAYER_TERMS = ['ui', 'state', 'api', 'model', 'repo', 'domain', 'port', 'shared', 'contracts'];

export const REQUIRED_HEADINGS = {
  'SKILL.md': [
    '## Principles', '## Glossary', '## Tiers', '## Dependency matrix', '## Module communication',
    '## Files and exports', '## Checklist', '## Scope and limits', '## References',
  ],
  'references/angular.md': ['## Domain structure', '## Rules', '## Tests'],
  'references/nestjs.md': ['## Domain structure', '## Rules', '## Tests'],
  'references/contracts.md': ['## libs/contracts', '## Events'],
  'references/transport.md': [
    '## Inbound adapters', '## Outbound messages', '## Calling a neighbor',
    '## Contracts by owner', '## Reliability', '## Monorepo layout',
  ],
  'references/enforcement.md': [
    '## Tags', '## Tools', '## Pre-commit hook', '## CI', '## arch:check',
    '## Verify before enabling',
  ],
  'references/migration.md': ['## Term mapping', '## Migration steps'],
};

export function parseFrontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const out = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([a-z-]+):\s*(.*)$/);
    if (kv) out[kv[1]] = kv[2];
  }
  return out;
}

export function codeFences(text) {
  const blocks = [];
  const re = /```[a-z]*\r?\n([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(text))) blocks.push(m[1]);
  return blocks;
}

export function checkSkillMd(text) {
  const fm = parseFrontmatter(text);
  if (!fm) return ['SKILL.md: no frontmatter'];
  const errors = [];
  if (fm.name !== 'fma') errors.push('SKILL.md: name must be fma');
  for (const kw of ['Angular', 'NestJS', 'facade', 'FMA']) {
    if (!(fm.description || '').includes(kw)) errors.push(`SKILL.md: description lacks "${kw}" (Angular/NestJS/facade/FMA)`);
  }
  const lines = text.split(/\r?\n/).length;
  if (lines > 200) errors.push(`SKILL.md: ${lines} lines, maximum is 200`);
  return errors;
}

export function checkChecklist(text) {
  const m = text.match(/^## Checklist[^\n]*\n([\s\S]*?)(?=^## |\s*$(?![\s\S]))/m);
  if (!m) return ['SKILL.md: no "## Checklist" section'];
  const count = (m[1].match(/^\d+\.\s/gm) || []).length;
  return count === 14 ? [] : [`SKILL.md: checklist has ${count} items, expected 14`];
}

export function checkMatrix(text) {
  const row = text.split(/\r?\n/).find((l) => l.startsWith('| From ↓ / To →'));
  if (!row) return ['SKILL.md: no matrix header "| From ↓ / To → |"'];
  const cells = row.split('|').map((c) => c.trim());
  const missing = LAYER_TERMS.filter((t) => !cells.includes(t));
  return missing.length ? [`SKILL.md: matrix lacks columns: ${missing.join(', ')}`] : [];
}

export function checkReferences(skillText, exists) {
  const refs = new Set(skillText.match(/references\/[a-z-]+\.md/g) || []);
  return [...refs].filter((r) => !exists(r)).map((r) => `SKILL.md: reference to a missing file ${r}`);
}

export function checkHeadings(rel, text) {
  const required = REQUIRED_HEADINGS[rel] || [];
  const lines = new Set(text.split(/\r?\n/).map((l) => l.trim()));
  return required.filter((h) => !lines.has(h)).map((h) => `${rel}: missing heading "${h}"`);
}

export function checkNoStarExports(rel, text) {
  return codeFences(text)
    .filter((b) => /export\s*\*/.test(b))
    .map(() => `${rel}: code example contains export * (forbidden)`);
}

// Snippets without which a reference contradicts the skill rules or the check templates.
export const REQUIRED_SNIPPETS = {
  'references/nestjs.md': ['CartModule', 'CartFacade'],
  // The EventPublisher port and the outbox must be linked: a use case sees only the port.
  'references/transport.md': ['OutboxEventPublisher', 'KafkaEventPublisher', 'shared/events'],
  // TypeScript 7.0 has no JS API: tools take TS 6 through an alias, tsc 7 is installed under a separate alias.
  'references/enforcement.md': [
    '@typescript/typescript6', '@typescript/native', 'path mapping',
    'Baseline profile', 'Fast profile', 'ESLint', 'Prettier', 'oxlint', 'oxfmt',
  ],
  // Two kinds of ports: infrastructure ones live in shared, domain ones in the domain.
  'SKILL.md': ['infrastructure port', 'domain port', 'every layer of the domain may import `types.ts`'],
};
export const FORBIDDEN_SNIPPETS = {
  'references/nestjs.md': ['provider classes are not exported'],
  // Sheriff requires importing domain/ through its index.ts.
  'references/angular.md': ["from './domain/"],
  // The baseline tools are ESLint and Prettier; oxlint and oxfmt are the fast profile, not a replacement.
  'references/enforcement.md': ['ESLint and Prettier are not used'],
};

export function checkSnippets(rel, text) {
  const missing = (REQUIRED_SNIPPETS[rel] || [])
    .filter((s) => !text.includes(s))
    .map((s) => `${rel}: missing required snippet "${s}"`);
  const banned = (FORBIDDEN_SNIPPETS[rel] || [])
    .filter((s) => text.includes(s))
    .map((s) => `${rel}: forbidden snippet "${s}"`);
  return [...missing, ...banned];
}

export function validateFile(dir, rel) {
  const file = path.join(dir, rel);
  if (!fs.existsSync(file)) return [`${rel}: file not found`];
  const text = fs.readFileSync(file, 'utf8');
  const errors = [...checkHeadings(rel, text), ...checkNoStarExports(rel, text), ...checkSnippets(rel, text)];
  if (rel === 'SKILL.md') {
    errors.push(
      ...checkSkillMd(text), ...checkChecklist(text), ...checkMatrix(text),
      ...checkReferences(text, (r) => fs.existsSync(path.join(dir, r))),
    );
  }
  return errors;
}

export function validateDir(dir) {
  return Object.keys(REQUIRED_HEADINGS).flatMap((rel) => validateFile(dir, rel));
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  const [dir, flag, only] = process.argv.slice(2);
  if (!dir) {
    console.error('usage: validate-skill <skillDir> [--only <rel>]');
    process.exit(2);
  }
  const errors = flag === '--only' ? validateFile(dir, only) : validateDir(dir);
  errors.forEach((e) => console.error(e));
  process.exit(errors.length ? 1 : 0);
}
