'use strict';

const {join} = require('node:path');

// Try multiple possible locations for the addon:
// 1. Relative to this file (development/source)
// 2. Relative to package root (bundled/dist)
function loadAddon () {
  const possiblePaths = [
    // Development: native/index.js -> native/build/Release/launch_services.node
    join(__dirname, 'build/Release/launch_services.node'),
    // Bundled: dist/index.js -> native/build/Release/launch_services.node
    join(__dirname, '..', 'native/build/Release/launch_services.node'),
    // Alternative: from process.cwd()
    join(process.cwd(), 'native/build/Release/launch_services.node')
  ];

  for (const addonPath of possiblePaths) {
    try {
      return require(addonPath);
    } catch {
      // Try next path
    }
  }

  console.log(
    'Could not find native addon. Tried paths: ' +
    possiblePaths.join(', ')
  );
}

const addon = loadAddon();

module.exports = {
  getApplicationsForFile: addon.getApplicationsForFile
};
