import {getOpenWithApps as gowa} from './getOpenWithApps.js';
import {extname} from 'node:path';
import {MacOSDefaults, OpenWith} from 'mac-defaults';
// @ts-expect-error - No type declarations available
import mdls from 'mdls';

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
    apps = /** @type {import('./getOpenWithApps.js').OpenWithApp[]} */ (
      nativeApps
    );

    // Add isFileDefault and isDefault properties that native addon doesn't set
    await enrichAppMetadata(filePath, apps);

    // Apply maxResults limit if specified
    if (options?.maxResults && apps.length > options.maxResults) {
      apps = apps.slice(0, options.maxResults);
    }
  } else {
    // Fall back to JavaScript implementation
    apps = await gowa(filePath, options);
  }

  return apps;
};

/**
 * Enrich apps with file-specific and user default metadata.
 * @param {string} filePath - Path to file
 * @param {import('./getOpenWithApps.js').OpenWithApp[]} apps - Apps array
 * @returns {Promise<void>}
 */
async function enrichAppMetadata (filePath, apps) {
  // Check for file-specific override (xattr)
  let fileDefaultPath = null;
  try {
    const openWith = new OpenWith();
    const {path} = await openWith.getAsync(filePath, {});
    if (path) {
      fileDefaultPath = path;
    }
  } catch {
    // No xattr override set
  }

  // Get file extension and UTI hierarchy
  const fileExt = extname(filePath).slice(1).toLowerCase();
  let contentTypes = [];
  try {
    const {ItemContentTypeTree} = await mdls(
      filePath,
      '-name kMDItemContentTypeTree'
    );
    contentTypes = ItemContentTypeTree || [];
  } catch {
    // Ignore mdls errors
  }

  // Get user defaults for this file type
  const userDefaultBundleIds = await getUserDefaultBundleIds(
    contentTypes,
    fileExt
  );

  // Enrich each app with the additional properties
  for (const app of apps) {
    app.isFileDefault = fileDefaultPath === app.path;
    app.isDefault = app.identifier
      ? userDefaultBundleIds.has(app.identifier.toLowerCase())
      : false;
  }
}

/**
 * Get user-configured default bundle IDs from Launch Services.
 * @param {string[]} contentTypes - Array of UTIs
 * @param {string} fileExt - File extension
 * @returns {Promise<Set<string>>} Set of bundle IDs
 */
async function getUserDefaultBundleIds (contentTypes, fileExt) {
  const bundleIds = new Set();

  try {
    const macOSDefaults = new MacOSDefaults();
    const lsHandlers = await macOSDefaults.read({
      domain: 'com.apple.LaunchServices/com.apple.launchservices.secure',
      key: 'LSHandlers'
    });

    if (!Array.isArray(lsHandlers)) {
      return bundleIds;
    }

    lsHandlers.forEach((handler) => {
      // Check if this handler matches our file extension
      if (handler.LSHandlerContentTagClass === 'public.filename-extension' &&
          handler.LSHandlerContentTag === fileExt) {
        const bundleId = handler.LSHandlerRoleEditor ||
          handler.LSHandlerRoleViewer ||
          handler.LSHandlerRoleAll;
        if (bundleId) {
          bundleIds.add(bundleId.toLowerCase());
        }
      }

      // Check if this handler matches any of our content types
      if (handler.LSHandlerContentType &&
          contentTypes.includes(handler.LSHandlerContentType)) {
        const bundleId = handler.LSHandlerRoleAll ||
          handler.LSHandlerRoleEditor ||
          handler.LSHandlerRoleViewer;
        if (bundleId) {
          bundleIds.add(bundleId.toLowerCase());
        }
      }
    });
  } catch {
    // Ignore errors reading defaults
  }

  return bundleIds;
}
