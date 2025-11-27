/**
 * Extract and convert macOS app icons to PNG data URIs.
 */
import {readFileSync} from 'node:fs';
import {Icns} from '@fiahfy/icns';
import DatauriParser from 'datauri/parser.js';

/**
 * Options for getAppIcon.
 * @typedef GetAppIconOptions
 * @property {number} [minSize] - Minimum icon size in bytes
 * @property {boolean} [preferLarger] - Prefer larger icons
 */

/**
 * Extract the best available icon from a macOS .icns file.
 * @param {string} iconPath - Path to .icns file
 * @param {GetAppIconOptions} [options] - Icon extraction options
 * @returns {string|null} PNG data URI or null if no valid icon found
 */
export function getAppIcon (iconPath, options = {}) {
  const {minSize = 0, preferLarger = false} = options;

  try {
    // eslint-disable-next-line n/no-sync -- Synchronous for simplicity
    const buf = readFileSync(iconPath);
    const icns = Icns.from(buf);

    // Sort by size
    const images = preferLarger
      ? icns.images.toSorted((a, b) => b.bytes - a.bytes)
      : icns.images.toSorted((a, b) => a.bytes - b.bytes);

    // Find first valid icon
    for (const icon of images) {
      if (icon.bytes < minSize) {
        continue;
      }

      const {osType, image} = icon;

      // Filter out problematic icon types
      if ((!osType.startsWith('ic') && !osType.startsWith('it')) ||
          ['ic04', 'icnV'].includes(osType)) {
        continue;
      }

      // Convert to PNG data URI
      try {
        const parser = new DatauriParser();
        parser.format('.png', image);
        return parser.content || null;
      } catch {
        continue;
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Get icons for multiple apps.
 * @param {Array<{icon?: string}>} apps - Array of app objects with icon paths
 * @param {GetAppIconOptions} [options] - Options passed to getAppIcon
 * @returns {Promise<Array<string|null>>} Array of data URIs (or null)
 */
export function getAppIcons (apps, options = {}) {
  return Promise.resolve(apps.map((app) => {
    if (!app.icon) {
      return null;
    }
    return getAppIcon(app.icon, options);
  }));
}
