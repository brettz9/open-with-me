# Native Launch Services Addon

High-performance Node.js addon for macOS that uses native Launch Services APIs to find applications that can open files.

## Performance

- **Native addon**: ~50ms
- **JavaScript implementation**: ~9000ms
- **Speedup**: **180x faster!**

## How It Works

The addon uses macOS Launch Services APIs directly:
- `LSCopyApplicationURLsForURL()` - Gets all apps that can open a file
- `LSCopyDefaultApplicationURLForURL()` - Gets the default app
- `NSBundle` - Reads app metadata (name, icon, bundle ID)

No shell commands, no text parsing - just direct API calls in Objective-C++.

## Building

```bash
cd native
npm install
```

This will automatically compile the addon using `node-gyp`.

## Usage

```javascript
const native = require('./native');

const result = native.getApplicationsForFile('/path/to/file.md');

console.log('Apps:', result.apps);
// [
//   {
//     name: 'Visual Studio Code',
//     path: '/Applications/Visual Studio Code.app',
//     identifier: 'com.microsoft.VSCode',
//     icon:
//       '/Applications/Visual Studio Code.app/Contents/Resources/Code.icns',
//     isSystemDefault: true
//   },
//   ...
// ]
```

## API

### `getApplicationsForFile(filePath: string): object`

Returns an object with:
- `apps`: Array of application objects
  - `name`: Display name of the application
  - `path`: Full path to the .app bundle
  - `identifier`: Bundle identifier (e.g., 'com.microsoft.VSCode')
  - `icon`: Path to the app icon (.icns file)
  - `isSystemDefault`: Whether this is the system default app for the file type

## Requirements

- macOS 10.15 (Catalina) or later
- Xcode Command Line Tools
- Node.js 20+ with N-API support

## Technical Details

- Uses N-API for Node.js compatibility
- Written in Objective-C++ (.mm file)
- Links against CoreServices, Foundation, and AppKit frameworks
- No external dependencies beyond Node.js

## Fallback

If the native addon isn't available or fails to build, the parent package falls back to the JavaScript implementation automatically.
