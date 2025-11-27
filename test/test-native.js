/* eslint-disable no-console -- CLI */
import {join} from 'node:path';

// Try to use native addon if available, fall back to JS implementation
let getOpenWithApps;
try {
  const native = await import('../native/index.js');
  console.log('Using native Launch Services addon');

  // Wrap native function to match expected API
  // eslint-disable-next-line require-await -- Matching API
  getOpenWithApps = async (/** @type {string} */ filePath) => {
    const result = native.getApplicationsForFile(filePath);
    return result.apps;
  };
} catch (error) {
  console.log('Native addon not available, using JS implementation');
  const module = await import('../src/getOpenWithApps.js');
  ({getOpenWithApps} = module);
}

const filePath = join(import.meta.dirname, '../README.md');

console.log('Getting apps that can open:', filePath);
console.time('Total time');

// Get prioritized list of apps
const apps = await getOpenWithApps(filePath, {
  includeAlternate: true,
  maxResults: 20,
  skipCompatibilityCheck: true
});

console.timeEnd('Total time');

// Sort by priority flags first, then alphabetically
apps.sort(
  /**
   * @param {import('../src/getOpenWithApps.js').OpenWithApp} a - First app
   * @param {import('../src/getOpenWithApps.js').OpenWithApp} b - Second app
   * @returns {number} Sort order
   */
  (a, b) => {
    // File-specific default first
    if (a.isFileDefault !== b.isFileDefault) {
      return b.isFileDefault ? 1 : -1;
    }
    // System default second
    if (a.isSystemDefault !== b.isSystemDefault) {
      return b.isSystemDefault ? 1 : -1;
    }
    // User default third
    if (a.isDefault !== b.isDefault) {
      return b.isDefault ? 1 : -1;
    }
    // Then alphabetically
    return a.name.localeCompare(b.name);
  }
);

console.log(`\nFound ${apps.length} apps:\n`);
apps.forEach(
  /**
   * @param {import('../src/getOpenWithApps.js').OpenWithApp} app - App info
   * @param {number} i - Index
   * @returns {void}
   */
  (app, i) => {
    console.log(`${i + 1}. ${app.name}`);
    console.log(`   Path: ${app.path}`);
    if (app.rank) {
      console.log(`   Rank: ${app.rank}`);
    }
    if (app.isFileDefault) {
      console.log('   ⭐ File-specific default (xattr)');
    }
    if (app.isSystemDefault) {
      console.log('   🎯 System default application');
    }
    if (app.isDefault) {
      console.log('   ✓ User default ("Change All")');
    }
    console.log('');
  }
);

