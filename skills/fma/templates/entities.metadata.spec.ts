// Copy next to the entities of a NestJS service (apps/<service>/src/entities.metadata.spec.ts). Vitest (import.meta.glob); with Jest import the entity files explicitly.
// Cross-domain relations are written by name (@ManyToOne('Category')) with `import type`, so the compiler no longer
// checks them: this spec fails when a relation names an entity that is not registered.
// Do not use DataSource.buildMetadatas() here: under SWC it fails on `string | null` columns without an explicit
// `type`. Check the full metadata with a ts-node script that loads the service data source and the service tsconfig
// (TypeORM CLI runs entities without tsconfig-paths, so a value import through an alias fails there, not here).
import { getMetadataArgsStorage } from 'typeorm';
import { describe, expect, it } from 'vitest';
// Import every entity file once so that the decorators register them.
import.meta.glob?.('./**/*.entity.ts', { eager: true });

describe('entity relations', () => {
  it('every relation names a registered entity', () => {
    const storage = getMetadataArgsStorage();
    const entityNames = new Set(storage.tables.map((t) => (t.target as Function).name));
    const unresolved: string[] = [];
    for (const relation of storage.relations) {
      const owner = (relation.target as Function).name;
      const target = relation.type as unknown;
      const name = typeof target === 'string' ? target : (target as () => Function)().name;
      if (!entityNames.has(name)) unresolved.push(`${owner}.${relation.propertyName} -> ${name}`);
    }
    expect(unresolved).toEqual([]);
  });
});
