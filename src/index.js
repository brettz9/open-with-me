/* eslint-disable no-console -- CLI */
import {readFileSync} from 'node:fs';
import {join, extname} from 'node:path';
import mdls from 'mdls';
import lsregister from 'lsregister';
import {MacOSDefaults, OpenWith} from 'mac-defaults';
import {Icns} from '@fiahfy/icns';
import DatauriParser from 'datauri/parser.js';

// const filePath = join(import.meta.dirname, 'index.js');
const filePath = join(import.meta.dirname, '../README.md');
const ext = extname(filePath).slice(1);

// Check xattr (if a file was changed on a case-by-case basis with
//    Get Info->Open with..., but not "Change all")
try {
  const openWith = new OpenWith();
  const {
    bundleidentifier, path
  } = await openWith.getAsync(filePath, {});
  console.log('bundleidentifier', bundleidentifier);
  console.log('path', path);
} catch (err) {
  console.log('er', err);
}

// Get content type info for the file (e.g., it is Markdown by
//   priority then plain text)
/** @type {string[] | undefined} */
let ItemContentTypeTree;
try {
  ({
    ItemContentTypeTree
  } = await mdls(filePath, '-name kMDItemContentTypeTree'));
  console.log('kMDItemContentTypeTree', ItemContentTypeTree);
} catch (err) {
  console.log('Error', err);
}

// Gets all registered applications and their file associations
// Using lsregister package which returns items with properties like:
//   - bundleId (string with bundle info including path, name, icons)
//   - claimId (string with binding info)
//   - bindings (content type UTI like "public.plain-text")
//   - name, icon, etc.
/**
 * @type {Record<string, Array<{name: string, path?: string,
 *   icon?: string}>>}
 */
const contentTypeObj = {};
const iconMap = new Map();

try {
  const result = await lsregister.dump();
  console.log('dump result', result.length);

  // Parse bundle entries to build app name and icon mapping
  // Map by bundle name like "HP (0x1420)" from bundleId first line
  const bundleMap = new Map();
  result.forEach((item) => {
    if (item.bundleId) {
      // First line has format: "BundleName (0xHEX)"
      const firstLineMatch = item.bundleId.match(/^(?<bundleName>.+?)(?:\s+\(0x[\da-f]+\))?\n/v);
      const nameMatch = item.bundleId.match(/\ndisplayName:\s+(?<name>.+)/v);
      const pathMatch = item.bundleId.match(/\npath:\s+(?<path>.+?)(?:\s+\(|$)/v);
      const iconMatch = item.bundleId.match(/\nicons:\s+(?<icon>.+)/v);

      if (firstLineMatch?.groups && nameMatch?.groups) {
        const bundleKey = firstLineMatch.groups.bundleName.trim();
        const name = nameMatch.groups.name.trim();
        const path = pathMatch?.groups?.path?.trim();
        const icon = iconMatch?.groups?.icon?.trim();

        bundleMap.set(bundleKey, {name, path, icon});

        if (icon && path) {
          iconMap.set(name, join(path, icon));
        }
      }
    }
  });

  console.log('bundleMap size:', bundleMap.size);

  // Process claim entries to map content types to apps
  let matchedClaims = 0;
  let unmatchedBundles = 0;
  result.forEach((item) => {
    if (item.claimId) {
      // Extract bindings (UTIs) from claimId string
      const bindingsMatch = item.claimId.match(/\nbindings:\s+(?<bindings>.+)/v);
      if (!bindingsMatch?.groups) {
        return;
      }

      // bindings can contain multiple UTIs
      //  (e.g., "public.plain-text, public.html")
      const utis = bindingsMatch.groups.bindings.split(',').map((s) => {
        return s.trim();
      });

      // Extract bundle reference from claimId (format: "bundle: Name (0xHEX)")
      const bundleMatch = item.claimId.match(
        /\nbundle:\s+(?<bundle>.+?)\s*\n/v
      );
      if (bundleMatch?.groups) {
        let bundleKey = bundleMatch.groups.bundle.trim();
        // Remove hex ID like " (0x1420)" to get just the name
        bundleKey = bundleKey.replace(/\s+\(0x[\da-f]+\)$/i, '');
        const bundleInfo = bundleMap.get(bundleKey);

        if (bundleInfo) {
          matchedClaims++;
          utis.forEach((uti) => {
            if (!contentTypeObj[uti]) {
              contentTypeObj[uti] = [];
            }
            // Avoid duplicates
            if (!contentTypeObj[uti].some((app) => {
              return app.name === bundleInfo.name;
            })) {
              contentTypeObj[uti].push(bundleInfo);
            }
          });
        } else {
          unmatchedBundles++;
          if (unmatchedBundles <= 3) {
            console.log('Unmatched bundle key:', JSON.stringify(bundleKey));
            console.log(
              'Sample keys:',
              [...bundleMap.keys()].slice(0, 3)
            );
          }
        }
      }
    }
  });

  console.log(
    `Matched ${matchedClaims} claims, ${unmatchedBundles} unmatched`
  );

  console.log(
    'contentTypeObj keys sample:',
    Object.keys(contentTypeObj).slice(0, 20)
  );
  console.log(
    'Has net.daringfireball.markdown?',
    'net.daringfireball.markdown' in contentTypeObj
  );
  console.log('Has public.plain-text?', 'public.plain-text' in contentTypeObj);
} catch (err) {
  console.log('Error', err);
}

// Combine apps from content type hierarchy (`ItemContentTypeTree`),
//  removes dupes, and sorts alphabetically
/** @type {string[]} */
const appNames = [...new Set(
  (ItemContentTypeTree || []).reduce(
    /**
     * @param {string[]} arr
     * @param {string} uti
     * @returns {string[]}
     */
    (arr, uti) => {
      if (!contentTypeObj[uti]) {
        return arr;
      }
      // Extract just the app names
      const names = contentTypeObj[uti].map((app) => app.name);
      // eslint-disable-next-line unicorn/prefer-spread -- Check
      return arr.concat(names);
    },
    /** @type {string[]} */ ([])
  )
)].toSorted();
console.log('appNames', appNames);

// Get the icons for the specified apps
const appIcons = appNames.map((appName) => {
  return iconMap.get(appName);
});

console.log('appIcons', appIcons);

const appIconPngs = appIcons.filter(Boolean).map((appIcon) => {
  // Read each macOS .icns file
  // eslint-disable-next-line n/no-sync -- Change
  const buf = readFileSync(appIcon);

  // Parses ICNS format, extracting embedded images
  const icns = new Icns(buf);

  // Sorts by size (smallest to largest)
  const imagesByIncreasingBytes = icns.images.toSorted((a, b) => {
    return a.bytes < b.bytes ? -1 : a.bytes > b.bytes ? 1 : 0;
  });
  const imagesAsBuffers = imagesByIncreasingBytes.map((icon) => icon.image);

  let src;
  // 'icon.osType', e.g., `ic09`: https://en.wikipedia.org/wiki/Apple_Icon_Image_format#Icon_types
  // console.log('imagesAsBuffers', imagesAsBuffers);
  imagesAsBuffers.some((imageAsBuffer, i) => {
    // Convert each image to PNG
    const parser = new DatauriParser();
    // Todo: Use this: console.log('mimetype', datauri.mimetype);
    parser.format('.png', imageAsBuffer);

    const {osType} = imagesByIncreasingBytes[i];
    if (
      // Exclude formats which have errors in display
      (!osType.startsWith('ic') && !osType.startsWith('it')) ||
      ['ic04', 'icnV'].includes(osType)) {
      return false;
    }
    console.log('osType:' + osType + ';');
    console.log(`<img src="${parser.content}" />`);
    src = parser.content;
    return true;
  });
  return src;
});

console.log('appIconPngs', appIconPngs);

// Get "Get Info"->"Open with..." -> "Change All" user-customized
//  file associations
try {
  const macOSDefaults = new MacOSDefaults();
  const lsHandlers = await macOSDefaults.read({
    domain: 'com.apple.LaunchServices/com.apple.launchservices.secure',
    key: 'LSHandlers'
  });
  // console.log('result', lsHandlers);

  // Filter for matching extensions or content types
  const matchingExtensionsOrContentTypes = lsHandlers.filter(({
    LSHandlerContentTagClass,
    LSHandlerContentTag,
    LSHandlerContentType
  }) => {
    // Check if it's an extension-based handler matching this file's extension;
    //   macOS typically creates an entry with LSHandlerContentType
    //   instead (e.g., net.daringfireball.markdown)
    if (LSHandlerContentTagClass === 'public.filename-extension' &&
      LSHandlerContentTag === ext) {
      return true;
    }
    // Check if it's a content-type handler matching any of this
    //  file's content types
    if (LSHandlerContentType &&
      ItemContentTypeTree?.includes(LSHandlerContentType)) {
      return true;
    }
    return false;
  });
  // eslint-disable-next-line @stylistic/max-len -- Long
  console.log('matchingExtensionsOrContentTypes', matchingExtensionsOrContentTypes);
} catch (err) {
  console.log('Err', err);
}
