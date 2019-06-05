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

// Gets all registered applications and their file associations,
//   filtering out
// eslint-disable-next-line @stylistic/max-len -- Long path
// /System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -dump | grep -n7 'public'
let contentTypeObj;

/** @type {string[]} */
const appsByExt = [];
const iconMap = new Map();
try {
  const result = await lsregister.dump();
  console.log('dump result', result.length);
  contentTypeObj = result.reduce((obj, item) => {
    const {
      plistCommon
      // contentType, extension,
      // uti, bindings, serviceId, uRLScheme,
      // bundleClass, containerMountState, extPointID,
      // claimId, volumeId // , ...others
    } = item;

    if (
      // Ignore if specific to a particular user or app's private config;
      //  we want application capabilities, document types, or URL schemes
      //  available across the system
      !plistCommon ||
      // `CFBundleDocumentTypes` is a key in an Apple app's
      //   Info.plist file that is an array of dictionaries that
      //   defines the types of documents the application is capable of
      //   opening, viewing, or editing
      !plistCommon.CFBundleDocumentTypes) {
      return obj;
    }
    if (
      // Ignore if no display name AND
      !plistCommon.CFBundleDisplayName &&
      // ignore if no bundle name
      !plistCommon.CFBundleName) {
      // Excludes `com.apple.system-library` and `com.apple.local-library`
      return obj;
    }
    const bundleName = plistCommon.CFBundleDisplayName ||
      plistCommon.CFBundleName;
    // CFBundleExecutable or CFBundleName seem similar? (use with `open -a`)
    // CFBundleIdentifier with `open -b`
    // return contentType;

    plistCommon.CFBundleDocumentTypes.forEach((dts) => {
      if (
        // If no abstract name for this document type OR
        !dts.CFBundleTypeName ||

        // If no info on content type in this document type AND
        (!dts.LSItemContentTypes &&
          // no file extension array for this document type
          !dts.CFBundleTypeExtensions)) {
        return;
      }
      // console.log('item', Object.keys(item).filter((i) => i.includes('ic')));
      // console.log('item', item.iconName, item.iconFlags, item.icons);

      // If only file extensions for this document type
      if (dts.CFBundleTypeExtensions && !dts.LSItemContentTypes) {
        // If matches the specified file's extension, add the
        //   application name
        if (dts.CFBundleTypeExtensions.includes(ext)) {
          appsByExt.push(bundleName);
          if (item.icons) {
            iconMap.set(bundleName, join(item.path, item.icons));
          }
          return;
        }
        return;
      }
      // If only has `CFBundleTypeName` is just a file type
      // console.log('item', plistCommon.CFBundleIdentifier, bundleName);

      // Content types like `public.plain-text`
      dts.LSItemContentTypes.forEach((LSItemContentType) => {
        if (!obj[LSItemContentType]) {
          obj[LSItemContentType] = [];
        }
        if (item.icons) {
          iconMap.set(bundleName, join(item.path, item.icons));
        }
        // obj[LSItemContentType].push(plistCommon.CFBundleIdentifier);

        // Map content types like `public.plain-text` to array of app names
        obj[LSItemContentType].push(bundleName); // .push(dts.CFBundleTypeName);
        // console.log('plistCommon', plistCommon.CFBundleIdentifier);
      });
      // || dts.CFBundleTypeExtensions || dts.CFBundleTypeMIMETypes);
    });
    return obj;
    /*
    return !bindings && !contentType && !extension &&
      !uti && !serviceId && !bundleClass && !containerMountState &&
      !extPointID && !uRLScheme && !claimId && !volumeId &&
      !Object.keys(others).some((item) => item.startsWith('pluginIdentif'));
    */
    // return bindings && (bindings.includes('.js') ||
    //    bindings.includes('javascript'));
    // This is messed up, but onto the right track now
  }, {});
  // console.log(JSON.stringify(contentTypeObj, null, 2));
} catch (err) {
  console.log('Error', err);
}

console.log('appsByExt', appsByExt);

// Combine apps from content type hierarchy (`ItemContentTypeTree`)
//  with extension-based matches (`appsByExt`), removes dupes,
//  and sorts alphabetically
const appNames = [...new Set((ItemContentTypeTree || []).reduce((arr, item) => {
  if (!contentTypeObj[item]) {
    return arr;
  }
  // eslint-disable-next-line unicorn/prefer-spread -- Check
  return arr.concat(contentTypeObj[item]);
}, appsByExt))].toSorted();
console.log('appNames', appNames);

// Get the icons for the specified apps
const appIcons = appNames.map((appName) => {
  return iconMap.get(appName);
});

console.log('appIcons', appIcons);

const appIconPngs = appIcons.map((appIcon) => {
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
