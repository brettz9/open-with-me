/* eslint-disable no-console -- CLI */
import {join} from 'node:path';
import {getOpenWithApps} from './getOpenWithApps.js';
import {getAppIcons} from './getAppIcon.js';

const filePath = join(import.meta.dirname, '../README.md');

console.log('Getting apps that can open:', filePath);

// Get prioritized list of apps
const apps = await getOpenWithApps(filePath, {
  includeAlternate: true,
  maxResults: 20
  // maxUTIDepth: 2 // Optionally limit to most specific UTIs
});

console.log(`\nFound ${apps.length} apps:\n`);
apps.forEach((app, i) => {
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
});

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
