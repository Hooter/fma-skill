import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Automatic grading of an agent answer against a case's expect fields. Coarse: substring matching.
// forbid hits need manual review: an answer may quote a forbidden phrase while explaining the ban.
export function gradeCase(answer, expect) {
  const lower = answer.toLowerCase();
  const missing = expect.mentions.filter((m) => !lower.includes(m.toLowerCase()));
  // A line with a negation ("without export *", "do not create domain/", "never ...") explains the ban rather than violating it.
  const NEGATION = /(^|[^a-z-])(not|no|never|without|don't|cannot|can't|forbidden|prohibited|avoid|ban(ned)?)([^a-z-]|$)/i;
  const lines = answer.split('\n');
  const forbidden = expect.forbid.filter((f) => lines.some((l) => l.includes(f) && !NEGATION.test(l)));
  const archCheck = /arch[:\-]check/i.test(answer);
  const pass = missing.length === 0 && forbidden.length === 0 && (!expect.runsArchCheck || archCheck);
  return { missing, forbidden, archCheck, pass };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  const [evalsDir, answersDir] = process.argv.slice(2);
  let failed = 0;
  for (const fw of ['angular', 'nestjs']) {
    const cases = JSON.parse(fs.readFileSync(path.join(evalsDir, `${fw}.json`), 'utf8'));
    for (const c of cases) {
      const file = path.join(answersDir, `${c.id}.md`);
      if (!fs.existsSync(file)) {
        console.log(`${c.id}: NO ANSWER`);
        failed++;
        continue;
      }
      const r = gradeCase(fs.readFileSync(file, 'utf8'), c.expect);
      if (!r.pass) failed++;
      const parts = [];
      if (r.missing.length) parts.push(`missing: ${r.missing.join(', ')}`);
      if (r.forbidden.length) parts.push(`forbidden: ${r.forbidden.join(', ')}`);
      if (c.expect.runsArchCheck && !r.archCheck) parts.push('no arch:check');
      console.log(`${c.id}: ${r.pass ? 'PASS' : 'FAIL'}${parts.length ? ' — ' + parts.join('; ') : ''}`);
    }
  }
  process.exit(failed ? 1 : 0);
}
