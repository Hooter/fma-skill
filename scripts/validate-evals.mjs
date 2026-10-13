import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function checkEvals(framework, cases) {
  if (!Array.isArray(cases)) return [`${framework}: expected an array of cases`];
  const errors = [];
  if (cases.length < 5) errors.push(`${framework}: ${cases.length} cases, need at least 5`);
  const seen = new Set();
  cases.forEach((c, i) => {
    const where = `${framework}[${i}]`;
    if (typeof c.id !== 'string' || !c.id) errors.push(`${where}: missing id`);
    else if (seen.has(c.id)) errors.push(`${where}: duplicate id "${c.id}"`);
    else seen.add(c.id);
    if (typeof c.prompt !== 'string' || !c.prompt) errors.push(`${where}: missing prompt`);
    const e = c.expect ?? {};
    if (!Array.isArray(e.mentions)) errors.push(`${where}: expect.mentions must be an array`);
    if (!Array.isArray(e.forbid)) errors.push(`${where}: expect.forbid must be an array`);
    if (typeof e.runsArchCheck !== 'boolean') errors.push(`${where}: expect.runsArchCheck must be a boolean`);
  });
  return errors;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  const dir = process.argv[2];
  const errors = ['angular', 'nestjs'].flatMap((fw) => {
    const file = path.join(dir, `${fw}.json`);
    if (!fs.existsSync(file)) return [`${fw}.json: file not found`];
    return checkEvals(fw, JSON.parse(fs.readFileSync(file, 'utf8')));
  });
  errors.forEach((e) => console.error(e));
  process.exit(errors.length ? 1 : 0);
}
