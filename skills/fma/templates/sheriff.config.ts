// Copy to apps/web/sheriff.config.ts.
import { sameTag, type SheriffConfig } from '@softarc/sheriff-core';

export const config: SheriffConfig = {
  version: 1,
  entryFile: 'src/main.ts',
  enableBarrelLess: false,
  modules: {
    // Shared-code segments (ui, util, data, forms, ...) are not domains. Each segment is a module
    // with a mandatory index.ts: deep imports (shared/ui/button) are forbidden.
    'src/app/shared/<segment>': ['kind:<segment>'],
    // Contracts (Zod schemas and types). Each contracts domain is a module with an index.ts; available to all
    // domains (through kind:*), and depend on nothing themselves.
    'libs/contracts/src/<name>': ['kind:contracts'],
    // Each domain is a module. Internal submodules (_items) and domain/ are nested inside it.
    'src/app/<domain>': ['domain:<domain>'],
    // The specific domain/ pattern must come before the generic <sub>: the first match wins.
    'src/app/<domain>/domain': ['layer:domain'],
    'src/app/<domain>/<sub>': ['domain:<domain>'],
  },
  depRules: {
    // A domain sees its own files and submodules, shared code and its own domain/ (rich tier).
    // Neighbors only through their index.ts (Sheriff requires a barrel).
    'domain:*': [sameTag, 'domain:*', 'kind:*', 'layer:domain'],
    // domain/ (rich tier) is pure TS: pure utilities only.
    'layer:domain': ['kind:util'],
    'kind:ui': ['kind:util', 'kind:ui'],
    'kind:util': [],
    'kind:data': ['kind:util'],
    'kind:contracts': [],
    root: ['*'],
  },
};
