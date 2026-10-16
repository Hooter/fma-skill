// Proposes a folder move table for a Feature-Sliced Design project, to be reviewed and passed to rewrite-imports.mjs.
// Usage: node tools/fsd-to-fma.mjs [--src src] [--out moves.json]
// Every slice of entities/, features/, widgets/ and pages/ becomes a domain folder directly under --src (so the domain
// root is --src; for Angular with domains in src/app pass --src src/app). The first layer that owns a name gets the
// plain name (entities, then features, widgets, pages); the others get `<name>-<layer>` and are listed under `merge`:
// merge them by hand. shared/lib becomes shared/util and shared/api becomes shared/data. `app` stays where it is
// (list it with --non-domains). Segments inside slices (ui, model, api, lib, config) are not touched: rename them
// by the rules of references/angular.md or references/nestjs.md after the move.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const LAYERS = ['entities', 'features', 'widgets', 'pages'];
const SHARED_SEGMENTS = { lib: 'util', api: 'data' };

const subdirs = (dir) =>
  fs.existsSync(dir)
    ? fs
        .readdirSync(dir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
    : [];

export function proposeMoves(srcDir, src = 'src') {
  const moves = {};
  const merge = [];
  const taken = new Map();
  const notes = [];
  for (const layer of LAYERS) {
    for (const slice of subdirs(path.join(srcDir, layer))) {
      let name = slice;
      if (taken.has(slice)) {
        name = `${slice}-${layer}`;
        merge.push({ slice: `${layer}/${slice}`, mergeInto: taken.get(slice), proposedName: name });
      } else taken.set(slice, slice);
      if (fs.existsSync(path.join(srcDir, name)) && !LAYERS.includes(name)) {
        notes.push(`${src}/${name} already exists: ${layer}/${slice} is not moved`);
        continue;
      }
      moves[`${src}/${layer}/${slice}/`] = `${src}/${name}/`;
    }
  }
  for (const [from, to] of Object.entries(SHARED_SEGMENTS)) {
    if (
      fs.existsSync(path.join(srcDir, 'shared', from)) &&
      !fs.existsSync(path.join(srcDir, 'shared', to))
    ) {
      moves[`${src}/shared/${from}/`] = `${src}/shared/${to}/`;
    }
  }
  for (const layer of LAYERS) {
    const rest = fs.existsSync(path.join(srcDir, layer))
      ? fs.readdirSync(path.join(srcDir, layer), { withFileTypes: true }).filter((e) => e.isFile())
      : [];
    if (rest.length)
      notes.push(
        `${src}/${layer} has files outside slices (${rest.map((e) => e.name).join(', ')}): move them by hand`,
      );
  }
  return { moves, merge, notes };
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  const argv = process.argv.slice(2);
  const flag = (name, fallback) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback);
  const src = flag('--src', 'src').replace(/\/+$/, '');
  const result = proposeMoves(path.resolve(src), src);
  const json = JSON.stringify(
    { moves: result.moves, merge: result.merge, notes: result.notes },
    null,
    2,
  );
  if (flag('--out')) fs.writeFileSync(flag('--out'), `${json}\n`);
  else console.log(json);
  console.error(
    `fsd-to-fma: ${Object.keys(result.moves).length} moves, ${result.merge.length} slices to merge by hand`,
  );
}
