import * as systemIcon2 from 'system-icon2';
import {fromByteArray} from 'base64-js';

/**
 * Options for getAppIcon.
 * @typedef GetAppIconOptions
 * @property {number} [size] - Icon size (16, 32, 64, 256, or 512)
 */

/**
 * Extract app icon using native system APIs.
 * @param {string} appPath - Path to .app bundle or .icns file
 * @param {GetAppIconOptions} [options] - Icon extraction options
 * @returns {Promise<string|null>} PNG data URI or null if extraction fails
 */
export async function getAppIcon (appPath, options = {}) {
  const {size = 16} = options;

  try {
    // Use system-icon2 which provides native icon extraction
    const iconBuffer = await systemIcon2.getIconForPath(appPath, size);

    if (!iconBuffer || iconBuffer.length === 0) {
      return null;
    }

    // Convert buffer to base64 data URI
    const base64 = fromByteArray(iconBuffer);
    return `data:image/png;base64,${base64}`;
  } catch (error) {
    // Return null on any error
    return null;
  }
}

/**
 * Get icons for multiple apps.
 * @param {Array<{path?: string, icon?: string}>} apps - Array of app objects
 * @param {GetAppIconOptions} [options] - Options passed to getAppIcon
 * @returns {Promise<Array<string|null>>} Array of data URIs (or null)
 */
export async function getAppIcons (apps, options = {}) {
  const iconPromises = apps.map(async (app) => {
    // Try app.path first (full app bundle), then app.icon (.icns file)
    const targetPath = app.path || app.icon;

    if (!targetPath) {
      return null;
    }

    try {
      return await getAppIcon(targetPath, options);
    } catch {
      return null;
    }
  });

  return await Promise.all(iconPromises);
}
