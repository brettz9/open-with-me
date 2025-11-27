/* eslint-disable no-console -- CLI */
import {join} from 'node:path';
import {getOpenWithApps} from '../src/getOpenWithApps.js';
import {getAppIcons} from '../src/getAppIcon.js';

// Try to use native addon, fall back to JS implementation
let nativeAddon;
try {
  nativeAddon = await import('../native/index.js');
  console.log('✓ Using native Launch Services addon\n');
} catch {
  console.log(
    '⚠ Native addon not available, using JavaScript implementation\n'
  );
}

const filePath = join(import.meta.dirname, '../README.md');

console.log('Getting apps that can open:', filePath);

// Get prioritized list of apps
let apps;
if (nativeAddon) {
  // Use native addon for fast performance
  const {apps: nativeApps} = nativeAddon.getApplicationsForFile(filePath);
  apps = nativeApps;
} else {
  // Fall back to JavaScript implementation
  apps = await getOpenWithApps(filePath, {
    includeAlternate: true,
    maxResults: 20
    // skipCompatibilityCheck: true // Skip arch checks for faster testing
    // maxUTIDepth: 2 // Optionally limit to most specific UTIs
  });
}

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
   * @param {import('../src/getOpenWithApps.js').OpenWithApp} app - Application
   *   info
   * @param {number} i - Index
   * @returns {void}
   */
  (app, i) => {
    console.log(`${i + 1}. ${app.name}`);
    console.log(`   Path: ${app.path}`);
    console.log(`   Rank: ${app.rank}`);
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


// Get icons for the apps
console.log('Extracting app icons...');
const icons = await getAppIcons(apps);
const validIcons = icons.filter(Boolean);
console.log(
  `Successfully extracted ${validIcons.length}/${apps.length} icons`
);

// Show first icon as example
if (validIcons.length > 0 && validIcons[0]) {
  console.log('\nFirst icon (truncated):');
  console.log(validIcons[0].slice(0, 100) + '...');
}
