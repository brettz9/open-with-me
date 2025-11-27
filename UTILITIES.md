# Open With Utilities

Two utility modules for extracting macOS "Open with" application information, designed for use with Electron or other desktop applications.

## Modules

### `getOpenWithApps.js`

Retrieves a prioritized list of applications that can open a given file, matching macOS Finder's "Open with" menu behavior.

#### Usage

```js
import {getOpenWithApps} from './getOpenWithApps.js';

const apps = await getOpenWithApps('/path/to/file.md', {
  includeAlternate: true, // Include apps with "Alternate" rank
  maxResults: 20 // Limit results
});

console.log('apps', apps);
// Returns array of:
// {
//   name: 'TextEdit',
//   path: '/System/Applications/TextEdit.app',
//   icon: '/System/Applications/TextEdit.app/Contents/Resources/Edit.icns',
//   rank: 'Default',              // Owner, Default, or Alternate
//   isDefault: false,              // User set as default via "Change All"
//   isFileDefault: false           // Set as default for this file only (xattr)
// }
```

#### Features

- **UTI-based detection**: Uses macOS Uniform Type Identifiers to find compatible apps
- **Rank filtering**: Filters out "None" rank apps, optionally includes "Alternate" rank
- **Prioritization**:
  1. File-specific defaults (xattr from "Open with" in Get Info)
  2. User defaults ("Change All" in Get Info)
  3. Owner rank (app created this file type)
  4. Default rank (preferred apps)
  5. UTI specificity (more specific types first)
- **User defaults detection**: Reads `LSHandlers` preferences to identify "Change All" settings

### `getAppIcon.js`

Extracts and converts macOS application icons from `.icns` format to PNG data URIs.

#### Usage

```js
import {getAppIcon, getAppIcons} from './getAppIcon.js';

// Single icon
const iconDataUri =
  getAppIcon('/Applications/TextEdit.app/Contents/Resources/Edit.icns', {
    minSize: 1024, // Minimum icon size in bytes
    preferLarger: false // false = smallest valid icon, true = largest
  });
console.log('iconDataUri', iconDataUri);
// Returns: 'data:image/png;base64,iVBORw0KG...' or null

// Multiple icons
const apps = await getOpenWithApps('/path/to/file.md');
const icons = await getAppIcons(apps);
console.log('icons', icons);
// Returns: array of data URIs or null values
```

#### Features

- **Format filtering**: Automatically filters out problematic icon formats (`ic04`, `icnV`)
- **Size selection**: Choose smallest (for performance) or largest (for quality) icons
- **Error handling**: Returns `null` for missing or corrupted icons
- **Data URI output**: Ready to use in HTML `<img src="">` or Electron

## Example: Electron Integration

```js
// In main process
import {getOpenWithApps} from './src/getOpenWithApps.js';
import {getAppIcons} from './src/getAppIcon.js';
import {shell} from 'electron';

/**
 * @param {string} filePath
 */
export async function showOpenWithMenu (filePath) {
  // Get apps
  const apps = await getOpenWithApps(filePath, {
    includeAlternate: true,
    maxResults: 10
  });

  // Get icons
  const icons = await getAppIcons(apps);

  // Build menu
  const menuItems = apps.map((app, i) => ({
    label: app.name,
    icon: icons[i], // Data URI
    click: () => shell.openPath(app.path)
  }));

  // Show context menu or send to renderer
  return {apps, icons};
}
```

## Technical Details

### macOS Components Used

1. **mdls**: Retrieves file metadata including `kMDItemContentTypeTree` (UTI hierarchy)
2. **lsregister**: Launch Services database containing app capabilities and file type associations
3. **mac-defaults**: Reads user preferences including `LSHandlers` for "Change All" settings
4. **OpenWith class**: Extracts file-specific xattr overrides

### Launch Services Ranks

- **Owner**: App created/owns this file type (highest priority)
- **Default**: Preferred app for this type
- **Alternate**: Can open but not preferred (shown in Finder's "Open with")
- **None**: Low priority, filtered out by default

### UTI Hierarchy Example

For a Markdown file:
```
net.daringfireball.markdown  (most specific)
  → public.plain-text
    → public.text
      → public.data
        → public.item         (most general)
```

The utility prioritizes apps that support the most specific UTI first.

## Dependencies

- `mdls` - File metadata extraction
- `lsregister` - Launch Services database access
- `mac-defaults` - macOS preferences reading
- `@fiahfy/icns` - ICNS format parsing
- `datauri` - Data URI generation

## Notes

- Only works on macOS (uses Launch Services)
- Requires Node.js with ES modules support
- Some system apps may have long placeholder paths in sandboxed containers
- Icon extraction may fail for some apps (returns `null`)
