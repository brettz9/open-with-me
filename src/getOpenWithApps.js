/* eslint-disable sonarjs/os-command -- API */
/* eslint-disable n/no-sync -- Disable for now */
/**
 * Get prioritized list of applications that can open a file,
 * matching Finder's "Open with" behavior.
 */
import {join, extname} from 'node:path';
import {execSync} from 'node:child_process';
// @ts-expect-error - No type declarations available
import mdls from 'mdls';
// @ts-expect-error - No type declarations available
import lsregister from 'lsregister';
import {MacOSDefaults, OpenWith} from 'mac-defaults';

// Cache for app compatibility checks to avoid repeated mdls calls
/** @type {Map<string, boolean>} */
const compatibilityCache = new Map();

/**
 * @typedef {object} OpenWithApp
 * @property {string} name - Application display name
 * @property {string} path - Full path to .app bundle
 * @property {string} [icon] - Path to app icon file
 * @property {string} rank - Launch Services rank (Owner/Default/Alternate)
 * @property {boolean} [isDefault] - User has set this as default
 * @property {boolean} [isFileDefault] - Set as default for this file only
 * @property {boolean} [isSystemDefault] - System default for file type
 * @property {string} [identifier] - Bundle identifier
 */

/**
 * Options for getOpenWithApps.
 * @typedef GetOpenWithAppsOptions
 * @property {boolean} [includeAlternate] - Include Alternate rank apps
 * @property {number} [maxResults] - Limit number of results
 * @property {boolean} [debug] - Enable debug logging
 * @property {number} [maxUTIDepth] - Only include apps from first N UTIs
 * @property {boolean} [includeWildcard] - Include apps with
 *   wildcard (*) support
 * @property {boolean} [skipCompatibilityCheck] - Skip architecture checks
 *   (faster but may include incompatible apps)
 */

/**
 * Get list of applications that can open the given file.
 * @param {string} filePath - Absolute path to the file
 * @param {GetOpenWithAppsOptions} [options] - Options for filtering results
 * @returns {Promise<OpenWithApp[]>} Prioritized list of applications
 */
export async function getOpenWithApps (filePath, options = {}) {
  const {
    includeAlternate = true,
    maxResults,
    debug = false,
    maxUTIDepth,
    includeWildcard = false,
    skipCompatibilityCheck = false
  } = options;

  // Get file extension
  const fileExt = extname(filePath).slice(1).toLowerCase();

  // Get content type hierarchy for the file
  let ItemContentTypeTree;
  try {
    ({ItemContentTypeTree} = await mdls(
      filePath,
      '-name kMDItemContentTypeTree'
    ));
  } catch {
    ItemContentTypeTree = [];
  }

  if (debug) {
    // eslint-disable-next-line no-console -- Debug output
    console.log('UTI hierarchy:', ItemContentTypeTree);
    // eslint-disable-next-line no-console -- Debug output
    console.log('File extension:', fileExt);
  }

  if (!ItemContentTypeTree || ItemContentTypeTree.length === 0) {
    return [];
  }

  // Check for file-specific override (xattr)
  let fileDefaultApp = null;
  try {
    const openWith = new OpenWith();
    const {bundleidentifier, path} = await openWith.getAsync(filePath, {});
    if (bundleidentifier && path) {
      fileDefaultApp = {bundleidentifier, path};
    }
  } catch {
    // No xattr override set
  }

  // Get user defaults for this file type ("Change All")
  const {userDefaults, systemDefaultBundleIds} = await getUserDefaults(
    ItemContentTypeTree,
    fileExt
  );

  // Get all registered apps and their capabilities
  const contentTypeObj = await getRegisteredApps(
    includeAlternate,
    fileExt,
    ItemContentTypeTree,
    debug,
    includeWildcard
  );

  if (debug) {
    // eslint-disable-next-line no-console -- Debug output
    console.log('\nApps by UTI:');
    ItemContentTypeTree.forEach(
      /**
       * @param {string} uti
       * @returns {void}
       */
      (uti) => {
        const apps = contentTypeObj[uti];
        if (apps) {
          // eslint-disable-next-line no-console -- Debugging
          console.log(`  ${uti}: ${apps.length} apps`);
          apps.slice(0, 3).forEach(
            /**
             * @param {{name: string, rank: string}} app
             * @returns {void}
             */
            (app) => {
              // eslint-disable-next-line no-console -- Debugging
              console.log(`    - ${app.name} (${app.rank})`);
            }
          );
        } else {
          // eslint-disable-next-line no-console -- Debugging
          console.log(`  ${uti}: NO APPS FOUND`);
        }
      }
    );
  }

  // Collect apps for each UTI in priority order (most specific first)
  const appMap = new Map();
  const rankPriority = {
    ExtensionMatch: 4,
    Owner: 3,
    Default: 2,
    Alternate: 1
  };

  // Define overly generic UTIs that should be filtered
  const genericUTIs = new Set([
    'public.data',
    'public.item',
    'public.content'
  ]);

  // Optionally limit to only the most specific UTIs
  const utisToProcess = maxUTIDepth
    ? ItemContentTypeTree.slice(0, maxUTIDepth)
    : ItemContentTypeTree;

  if (debug && maxUTIDepth) {
    // eslint-disable-next-line no-console -- Debug output
    console.log(`\nLimiting to first ${maxUTIDepth} UTIs:`, utisToProcess);
  }

  utisToProcess.forEach(
    /**
     * @param {string} uti
     * @param {number} index
     * @returns {void}
     */
    (uti, index) => {
      if (!contentTypeObj[uti]) {
        return;
      }

      // Weight by UTI specificity (earlier = more specific)
      const utiWeight = ItemContentTypeTree.length - index;

      contentTypeObj[uti].forEach((app) => {
        const key = app.name;
        const existing = appMap.get(key);
        const rankWeight = (
          rankPriority[
            /** @type {keyof typeof rankPriority} */ (app.rank)
          ] || 0
        );
        const totalWeight = (rankWeight * 10) + utiWeight;

        // Skip apps that only match on very generic UTIs
        // unless they also match on more specific UTIs
        // UNLESS they have ExtensionMatch rank (explicitly support extension)
        if (!existing && genericUTIs.has(uti) &&
            app.rank !== 'ExtensionMatch') {
          // Check if this app appears in any more specific UTI
          const hasSpecificUTI = utisToProcess.some(
            // eslint-disable-next-line @stylistic/max-len -- Long
            (/** @type {string} */ specificUti) => !genericUTIs.has(specificUti) &&
              contentTypeObj[specificUti]?.some((a) => a.name === app.name)
          );
          if (!hasSpecificUTI) {
            return; // Skip this app
          }
        }

        // Check compatibility only for apps that passed UTI filtering
        if (!skipCompatibilityCheck && app.path && app.path.endsWith('.app') &&
            !isAppCompatible(app.path)) {
          return; // Skip incompatible apps (e.g., 32-bit only)
        }

        if (!existing || totalWeight > existing.weight) {
          appMap.set(key, {
            ...app,
            weight: totalWeight,
            isDefault: userDefaults.has(app.name),
            isFileDefault: fileDefaultApp?.path === app.path,
            isSystemDefault: app.identifier &&
              systemDefaultBundleIds.has(app.identifier.toLowerCase())
          });
        }
      });
    }
  );

  // Convert to array and sort by priority
  let apps = [...appMap.values()].toSorted((a, b) => {
    // File-specific default first
    if (a.isFileDefault && !b.isFileDefault) {
      return -1;
    }
    if (!a.isFileDefault && b.isFileDefault) {
      return 1;
    }
    // System default second
    if (a.isSystemDefault && !b.isSystemDefault) {
      return -1;
    }
    if (!a.isSystemDefault && b.isSystemDefault) {
      return 1;
    }
    // User default third
    if (a.isDefault && !b.isDefault) {
      return -1;
    }
    if (!a.isDefault && b.isDefault) {
      return 1;
    }
    // Then by weight (rank + UTI specificity)
    if (b.weight !== a.weight) {
      return b.weight - a.weight;
    }
    // Finally alphabetically
    return a.name.localeCompare(b.name);
  });

  // Remove weight property before returning
  apps = apps.map(({
    // eslint-disable-next-line no-unused-vars -- Removing property
    weight: _weight,
    ...app
  }) => app);

  // Limit results if requested
  if (maxResults && apps.length > maxResults) {
    apps = apps.slice(0, maxResults);
  }

  return apps;
}

/**
 * Get user-configured defaults from Launch Services.
 * @param {string[]} contentTypes - Array of UTIs
 * @param {string} fileExt - File extension
 * @returns {Promise<{userDefaults: Set<string>,
 *   systemDefaultBundleIds: Set<string>}>} Default app info
 */
async function getUserDefaults (contentTypes, fileExt) {
  const defaults = new Set();
  const systemDefaultBundleIds = new Set();

  try {
    const macOSDefaults = new MacOSDefaults();
    const lsHandlers = await macOSDefaults.read({
      domain: 'com.apple.LaunchServices/com.apple.launchservices.secure',
      key: 'LSHandlers'
    });

    if (!Array.isArray(lsHandlers)) {
      return {userDefaults: defaults, systemDefaultBundleIds};
    }

    lsHandlers.forEach((handler) => {
      // Check if this handler matches our file extension
      if (handler.LSHandlerContentTagClass === 'public.filename-extension' &&
          handler.LSHandlerContentTag === fileExt) {
        // Get the default app bundle ID
        const bundleId = handler.LSHandlerRoleEditor ||
          handler.LSHandlerRoleViewer ||
          handler.LSHandlerRoleAll;
        if (bundleId) {
          systemDefaultBundleIds.add(bundleId.toLowerCase());
        }
      }

      // Check if this handler matches any of our content types
      if (handler.LSHandlerContentType &&
          contentTypes.includes(handler.LSHandlerContentType)) {
        // Get bundle ID from handler
        const bundleId = handler.LSHandlerRoleAll ||
          handler.LSHandlerRoleEditor ||
          handler.LSHandlerRoleViewer;
        if (bundleId) {
          systemDefaultBundleIds.add(bundleId.toLowerCase());
          defaults.add(bundleId);
        }
      }
    });
  } catch {
    // Ignore errors reading defaults
  }

  return {userDefaults: defaults, systemDefaultBundleIds};
}

/**
 * Check if app is compatible with current macOS version.
 * @param {string} appPath - Path to .app bundle
 * @returns {boolean} True if compatible, false otherwise
 */
function isAppCompatible (appPath) {
  // Check cache first
  if (compatibilityCache.has(appPath)) {
    return compatibilityCache.get(appPath) ?? true;
  }

  // System apps are always compatible
  if (appPath.startsWith('/System/')) {
    compatibilityCache.set(appPath, true);
    return true;
  }

  try {
    // Check architecture - macOS requires 64-bit since Catalina (10.15)
    const result = execSync(
      `mdls -name kMDItemExecutableArchitectures "${appPath}" 2>/dev/null`,
      {encoding: 'utf8'}
    );

    // Parse architectures from output like:
    //   kMDItemExecutableArchitectures = (i386)
    // eslint-disable-next-line prefer-named-capture-group -- Convenient
    const archMatch = result.match(/kMDItemExecutableArchitectures\s*=\s*\(([^\)]+)\)/sv);
    if (!archMatch) {
      compatibilityCache.set(appPath, true);
      return true; // Can't determine, assume compatible
    }

    const architectures = archMatch[1].
      split(',\n').
      map((arch) => arch.trim().replaceAll('"', ''));

    // Check if app only has 32-bit architectures (i386, ppc)
    const is32BitOnly = architectures.every(
      (arch) => arch === 'i386' || arch === 'ppc' || arch === 'ppc7400' ||
        arch === 'ppc970' || arch === '(null)' || arch === ''
    );

    const compatible = !is32BitOnly;
    compatibilityCache.set(appPath, compatible);
    return compatible;
  } catch {
    compatibilityCache.set(appPath, true);
    return true; // If check fails, assume compatible
  }
}

/**
 * Get all registered applications and their document type support.
 * @param {boolean} includeAlternate - Include apps with Alternate rank
 * @param {string} fileExt - File extension to match (e.g., 'md')
 * @param {string[]} utiHierarchy - UTI hierarchy for the file
 * @param {boolean} debug - Enable debug logging
 * @param {boolean} includeWildcard - Include wildcard extension support
 * @returns {Promise<Record<string, Array<{name: string, path: string,
 *   icon?: string, rank: string, identifier?: string}>>>}
 *   Map of UTIs to app arrays
 */
async function getRegisteredApps (
  includeAlternate,
  fileExt,
  utiHierarchy,
  debug = false,
  includeWildcard = false
) {
  /**
   * @type {Record<string, Array<{name: string, path: string,
   *   icon?: string, rank: string, identifier?: string}>>}
   */
  const contentTypeObj = {};
  const result = await lsregister.dump();

  // Build bundle name to info mapping AND check for extension support
  /**
   * @type {Map<string, {name: string, path: string, icon?: string,
   *   identifier?: string}>
   * }
   */
  const bundleMap = new Map();

  // Apps that support file extension (check all apps' paths for Info.plist)
  /** @type {Map<string, string>} */
  const extensionApps = new Map(); // appPath -> appName

  result.forEach(
    /**
     * @param {{
     *   bundleId?: string
     * }} item - lsregister dump item
     * @returns {void}
     */
    (item) => {
      if (item.bundleId) {
        const firstLineMatch = item.bundleId.match(
          /^(?<bundleName>.+?)(?:\s+\(0x[\da-f]+\))?\n/v
        );
        const displayNameMatch = item.bundleId.match(
          /\ndisplayName:\s+(?<name>.+)/v
        );
        const nameMatch = item.bundleId.match(/\nname:\s+(?<name>.+)/v);
        const pathMatch = item.bundleId.match(
          /\npath:\s+(?<path>.+?)(?:\s+\(|$)/v
        );
        const iconMatch = item.bundleId.match(/\nicons:\s+(?<icon>.+)/v);
        const identifierMatch = item.bundleId.match(
          /\nidentifier:\s+(?<identifier>\S+)/v
        );

        if (firstLineMatch?.groups &&
            (displayNameMatch?.groups || nameMatch?.groups)) {
          const bundleKey = firstLineMatch.groups.bundleName.trim();
          // Prefer displayName over name
          const name = (displayNameMatch?.groups?.name ||
            nameMatch?.groups?.name || '').trim();
          const path = pathMatch?.groups?.path?.trim();
          const icon = iconMatch?.groups?.icon?.trim();
          const identifier = identifierMatch?.groups?.identifier?.trim();

          /**
           * @type {{name: string, path: string, icon?: string,
           *   identifier?: string}}
           */
          const info = {
            name,
            path: path || '',
            identifier
          };
          if (icon && path) {
            info.icon = join(path, icon);
          }

          // Prefer /Applications/ paths over simulator/container paths
          const existing = bundleMap.get(bundleKey);
          const isMainApp = path && path.startsWith('/Applications/');
          const existingIsMainApp = existing?.path.startsWith(
            '/Applications/'
          );

          // Don't check compatibility yet - defer until we know if app
          // is relevant for this file type to avoid unnecessary checks
          if (!existing || (isMainApp && !existingIsMainApp)) {
            bundleMap.set(bundleKey, info);
          }

          // Check for extension support by reading Info.plist if path exists
          if (fileExt && path && path.endsWith('.app')) {
            try {
              // Check if Info.plist contains this extension
              const plistPath = `${path}/Contents/Info.plist`;
              const plistContent = execSync(
                `plutil -convert json -o - "${plistPath}" 2>/dev/null`
              ).toString();

              if (plistContent) {
                try {
                  const plist = JSON.parse(plistContent);
                  const docTypes = plist.CFBundleDocumentTypes || [];

                  // Check if any document type explicitly supports
                  //   this extension
                  const supportsExtension = docTypes.some(
                    /**
                     * @param {{CFBundleTypeExtensions?: string[]}} docType
                     * @returns {boolean}
                     */
                    (docType) => {
                      const extensions = docType.CFBundleTypeExtensions || [];
                      // Match explicit extension or wildcard (if enabled)
                      return extensions.includes(fileExt) ||
                        (includeWildcard && extensions.includes('*'));
                    }
                  );

                  if (supportsExtension) {
                    extensionApps.set(path, name);
                    if (debug) {
                      // eslint-disable-next-line no-console -- Debug output
                      console.log(`✓ ${name} supports .${fileExt}`);
                    }
                  }
                } catch {
                  // JSON parse error - ignore
                }
              }
            } catch {
              // Ignore plist read errors
            }
          }
        }
      }
    }
  );
  // Process claims to map content types to apps
  result.forEach(
    /**
     * @param {{
     *   claimId?: string
     * }} item - lsregister dump item
     * @returns {void}
     */
    (item) => {
      if (item.claimId) {
        const bindingsMatch = item.claimId.match(
          /\nbindings:\s+(?<bindings>.+)/v
        );
        if (!bindingsMatch?.groups) {
          return;
        }

        const rankMatch = item.claimId.match(/\nrank:\s+(?<rank>\w+)/v);
        const rank = rankMatch?.groups?.rank || 'None';

        // Filter by rank
        if (rank === 'None') {
          return;
        }
        if (!includeAlternate && rank === 'Alternate') {
          return;
        }

        const utis = bindingsMatch.groups.bindings.split(',').map(
          /**
           * @param {string} s - UTI string
           * @returns {string}
           */
          (s) => s.trim()
        );

        const bundleMatch = item.claimId.match(
          /\nbundle:\s+(?<bundle>.+?)\s*\n/v
        );
        if (bundleMatch?.groups) {
          let bundleKey = bundleMatch.groups.bundle.trim();
          bundleKey = bundleKey.replace(/\s+\(0x[\da-f]+\)$/iv, '');
          const bundleInfo = bundleMap.get(bundleKey);

          if (bundleInfo) {
            // Boost rank if this app matches by extension
            const matchesByExtension = extensionApps.has(bundleInfo.path);
            const effectiveRank = matchesByExtension
              ? 'ExtensionMatch'
              : rank;

            utis.forEach(
              /**
               * @param {string} uti - UTI string
               * @returns {void}
               */
              (uti) => {
                if (!contentTypeObj[uti]) {
                  contentTypeObj[uti] = [];
                }
                const appWithRank = {...bundleInfo, rank: effectiveRank};
                if (!contentTypeObj[uti].some(
                  /**
                   * @param {{name: string}} app - App object
                   * @returns {boolean}
                   */
                  (app) => app.name === bundleInfo.name
                )) {
                  contentTypeObj[uti].push(appWithRank);
                }
              }
            );
          }
        }
      }
    }
  );

  // Add apps that match by extension but don't have UTI claims
  // OR apps that are in irrelevant UTIs but support our extension
  extensionApps.forEach((appName, appPath) => {
    // Check if this app is already in contentTypeObj for
    // any of our RELEVANT UTIs
    let alreadyAddedToRelevantUTI = false;
    let foundInUTI = null;
    for (const uti of utiHierarchy) {
      if (contentTypeObj[uti] &&
          contentTypeObj[uti].some((app) => app.path === appPath)) {
        alreadyAddedToRelevantUTI = true;
        foundInUTI = uti;
        break;
      }
    }

    if (alreadyAddedToRelevantUTI) {
      if (debug) {
        // eslint-disable-next-line no-console -- Debug output
        console.log(
          `${appName} already in relevant UTI: ${foundInUTI}`
        );
      }
      return;
    }

    if (debug) {
      // eslint-disable-next-line no-console -- Debug output
      console.log(`Adding extension-matching app: ${appName} at ${appPath}`);
    }
    // Add to public.data UTI with ExtensionMatch rank
    const fallbackUTI = 'public.data';
    if (!contentTypeObj[fallbackUTI]) {
      contentTypeObj[fallbackUTI] = [];
    }

    // Get app info from bundleMap by path
    let appInfo = null;
    for (const [, info] of bundleMap) {
      if (info.path === appPath) {
        appInfo = info;
        break;
      }
    }

    if (appInfo) {
      contentTypeObj[fallbackUTI].push({
        ...appInfo,
        rank: 'ExtensionMatch'
      });
    } else {
      // App not in bundleMap - create entry from available info
      if (debug) {
        // eslint-disable-next-line no-console -- Debug output
        console.log(`  ${appName} not in bundleMap, creating entry`);
      }

      // Try to find icon path
      let iconPath;
      try {
        const plistPath = `${appPath}/Contents/Info.plist`;
        const plistContent = execSync(
          `plutil -convert json -o - "${plistPath}" 2>/dev/null || echo ""`
        ).toString();
        const plist = JSON.parse(plistContent);
        const iconFile = plist.CFBundleIconFile ||
          plist.CFBundleIcons?.CFBundlePrimaryIcon?.CFBundleIconFile;
        if (iconFile) {
          iconPath = join(
            appPath,
            'Contents/Resources',
            iconFile.endsWith('.icns') ? iconFile : `${iconFile}.icns`
          );
        }
      } catch {
        // Ignore
      }

      contentTypeObj[fallbackUTI].push({
        name: appName,
        path: appPath,
        icon: iconPath,
        rank: 'ExtensionMatch'
      });
    }
  });

  return contentTypeObj;
}
