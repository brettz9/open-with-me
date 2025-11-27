# Performance Analysis

## Current Performance
- **~9 seconds** with all optimizations
- **~34 seconds** before optimizations (74% improvement)

## Bottlenecks

###1. lsregister.dump() - 4.6 seconds (51%)
The `lsregister` npm package executes `/System/Library/Frameworks/CoreServices.framework/.../lsregister -dump` and parses 9,295 text entries.

### 2. Entry Processing - 3-4 seconds (40%)
- Regex matching on 9,295 bundleId strings
- Reading Info.plist files with `plutil` + `execSync`
- Building bundle maps and extension maps

### 3. Architecture Checks - ~1 second (9%)
- `mdls` calls for ~12-15 apps after UTI filtering
- Can be disabled with `skipCompatibilityCheck: true`

## Optimizations Applied

✅ **Module-level caching**
- `compatibilityCache` - caches architecture checks across calls
- Reduces repeated `mdls` executions

✅ **Deferred compatibility checking**
- Only check apps that passed UTI filtering (~12 vs ~hundreds)
- 90% reduction in architecture checks

✅ **System app skip**
- `/System/` apps assumed compatible (always 64-bit)

✅ **Optional compatibility checking**
- `skipCompatibilityCheck` option saves ~1 second

## Why Finder is Instant

Finder uses **native Launch Services APIs** in memory:
- `LSCopyApplicationURLsForURL()` - gets apps for a file URL
- `LSCopyDefaultHandlerForURL()` - gets default handler
- No shell commands, no text parsing
- Direct access to Launch Services database

## Path to Sub-Second Performance

To achieve <1 second, you would need to:

### Option 1: Native Node Addon (Recommended)
Write a C++/Objective-C addon that uses Launch Services APIs directly:
```objc
LSCopyApplicationURLsForURL(fileURL, kLSRolesAll)
```

Estimated time: **50-200ms**

### Option 2: Replace lsregister Package
The `lsregister` package is the main bottleneck. Alternatives:
- Write custom parser that only extracts needed data
- Use a binary format cache instead of re-parsing text
- Query Launch Services database directly

### Option 3: Pre-compute and Cache
- Cache processed results per UTI in a local database
- Only rebuild when Launch Services database changes
- Could achieve <100ms for cached queries

## Recommendation

For production use with sub-second performance, a **native addon** is the only realistic solution. The current JavaScript approach is fundamentally limited by:
1. Shell command overhead
2. Text parsing overhead
3. Lack of direct API access

The 74% improvement (34s → 9s) is the best achievable with the current architecture.
