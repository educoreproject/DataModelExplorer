'use strict';

const { createProviderRegistry } = require('../providerRegistry');
const aiToolsDir = '/Users/tqwhite/Documents/webdev/educore/system/code/cli/lib.d';

// Test 1: No suppression — should load all providers
const reg1 = createProviderRegistry(aiToolsDir);
console.log('Test 1 - All providers:', reg1.getRegisteredNames());
console.assert(reg1.hasProviders(), 'Should have providers');

// Test 2: Suppress one — should load the others
const reg2 = createProviderRegistry(aiToolsDir, ['CEDS']);
console.log('Test 2 - CEDS suppressed:', reg2.getRegisteredNames());
console.assert(!reg2.getRegisteredNames().map(n => n.toLowerCase()).includes('ceds'), 'CEDS should be suppressed');

// Test 3: Suppress all known — should have no providers
const reg3 = createProviderRegistry(aiToolsDir, ['CEDS', 'SifSearch']);
console.log('Test 3 - All suppressed:', reg3.getRegisteredNames());
console.assert(!reg3.hasProviders(), 'Should have no providers');

// Test 4: Empty suppression list — should load all (same as Test 1)
const reg4 = createProviderRegistry(aiToolsDir, []);
console.log('Test 4 - Empty suppress list:', reg4.getRegisteredNames());
console.assert(reg4.hasProviders(), 'Should have providers');

console.log('All providerRegistry tests passed.');
