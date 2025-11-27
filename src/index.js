import {getOpenWithApps as gowa} from './getOpenWithApps.js';

export * from './getAppIcon.js';

// eslint-disable-next-line import/export -- Override
export * from './getOpenWithApps.js';

/**
 * @param {string} filePath
 * @param {import('./getOpenWithApps.js').GetOpenWithAppsOptions} [options]
 */
// eslint-disable-next-line import/export -- Override
export const getOpenWithApps = async (filePath, options) => {
  // Try to use native addon, fall back to JS implementation
  let nativeAddon;
  try {
    nativeAddon = await import('../native/index.js');
  } catch {
  }

  // Get prioritized list of apps
  let apps;
  if (nativeAddon) {
    // Use native addon for fast performance
    const {apps: nativeApps} = nativeAddon.getApplicationsForFile(filePath);
    apps = nativeApps;
  } else {
    // Fall back to JavaScript implementation
    apps = await gowa(filePath, options);
  }

  return apps;
};
