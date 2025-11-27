#import <Foundation/Foundation.h>
#import <CoreServices/CoreServices.h>
#import <AppKit/AppKit.h>
#include <node_api.h>

napi_value GetApplicationsForFile(napi_env env, napi_callback_info info) {
    size_t argc = 1;
    napi_value args[1];
    napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);

    if (argc < 1) {
        napi_throw_error(env, nullptr, "Expected file path");
        return nullptr;
    }

    size_t str_size;
    napi_get_value_string_utf8(env, args[0], nullptr, 0, &str_size);
    char* file_path = new char[str_size + 1];
    napi_get_value_string_utf8(env, args[0], file_path, str_size + 1, &str_size);

    @autoreleasepool {
        NSString *filePath = [NSString stringWithUTF8String:file_path];
        delete[] file_path;

        NSURL *fileURL = [NSURL fileURLWithPath:filePath];
        if (!fileURL) {
            napi_throw_error(env, nullptr, "Invalid file path");
            return nullptr;
        }

        CFArrayRef appURLs = LSCopyApplicationURLsForURL((__bridge CFURLRef)fileURL, kLSRolesAll);

        napi_value result, apps_array;
        napi_create_object(env, &result);
        napi_create_array(env, &apps_array);

        if (appURLs) {
            CFIndex count = CFArrayGetCount(appURLs);
            CFURLRef defaultAppURL = LSCopyDefaultApplicationURLForURL(
                (__bridge CFURLRef)fileURL, kLSRolesAll, nullptr);

            // Get apps for specific roles to determine rank
            CFArrayRef editorApps = LSCopyApplicationURLsForURL((__bridge CFURLRef)fileURL, kLSRolesEditor);
            CFArrayRef viewerApps = LSCopyApplicationURLsForURL((__bridge CFURLRef)fileURL, kLSRolesViewer);

            for (CFIndex i = 0; i < count; i++) {
                CFURLRef appURL = (CFURLRef)CFArrayGetValueAtIndex(appURLs, i);
                NSString *appPath = [(__bridge NSURL *)appURL path];

                // Determine rank based on roles
                const char* rank = "Alternate";
                if (editorApps) {
                    CFIndex editorCount = CFArrayGetCount(editorApps);
                    for (CFIndex j = 0; j < editorCount; j++) {
                        if (CFEqual(appURL, CFArrayGetValueAtIndex(editorApps, j))) {
                            rank = (j == 0) ? "Default" : "Owner";
                            break;
                        }
                    }
                }
                if (strcmp(rank, "Alternate") == 0 && viewerApps) {
                    CFIndex viewerCount = CFArrayGetCount(viewerApps);
                    for (CFIndex j = 0; j < viewerCount; j++) {
                        if (CFEqual(appURL, CFArrayGetValueAtIndex(viewerApps, j))) {
                            rank = (j == 0) ? "Default" : "Owner";
                            break;
                        }
                    }
                }
                NSBundle *bundle = [NSBundle bundleWithPath:appPath];
                if (!bundle) continue;

                NSString *appName = [bundle objectForInfoDictionaryKey:@"CFBundleDisplayName"];
                if (!appName || [appName length] == 0) {
                    appName = [bundle objectForInfoDictionaryKey:@"CFBundleName"];
                }
                if (!appName) {
                    appName = [[appPath lastPathComponent] stringByDeletingPathExtension];
                }

                NSString *bundleId = [bundle bundleIdentifier];
                NSString *iconFile = [bundle objectForInfoDictionaryKey:@"CFBundleIconFile"];
                NSString *iconPath = nil;
                if (iconFile) {
                    if (![iconFile hasSuffix:@".icns"]) {
                        iconFile = [iconFile stringByAppendingString:@".icns"];
                    }
                    iconPath = [[bundle resourcePath] stringByAppendingPathComponent:iconFile];
                }

                bool isDefault = defaultAppURL && CFEqual(appURL, defaultAppURL);


                napi_value app_obj, name_val, path_val, default_val, rank_val;
                napi_create_object(env, &app_obj);
                napi_create_string_utf8(env, [appName UTF8String], NAPI_AUTO_LENGTH, &name_val);
                napi_create_string_utf8(env, [appPath UTF8String], NAPI_AUTO_LENGTH, &path_val);
                napi_create_string_utf8(env, rank, NAPI_AUTO_LENGTH, &rank_val);
                napi_get_boolean(env, isDefault, &default_val);

                napi_set_named_property(env, app_obj, "name", name_val);
                napi_set_named_property(env, app_obj, "path", path_val);
                napi_set_named_property(env, app_obj, "rank", rank_val);
                napi_set_named_property(env, app_obj, "isSystemDefault", default_val);

                if (bundleId) {
                    napi_value id_val;
                    napi_create_string_utf8(env, [bundleId UTF8String], NAPI_AUTO_LENGTH, &id_val);
                    napi_set_named_property(env, app_obj, "identifier", id_val);
                }

                if (iconPath) {
                    napi_value icon_val;
                    napi_create_string_utf8(env, [iconPath UTF8String], NAPI_AUTO_LENGTH, &icon_val);
                    napi_set_named_property(env, app_obj, "icon", icon_val);
                }

                napi_set_element(env, apps_array, i, app_obj);
            }

            if (editorApps) CFRelease(editorApps);
            if (viewerApps) CFRelease(viewerApps);
            if (defaultAppURL) CFRelease(defaultAppURL);
            CFRelease(appURLs);
        }

        napi_set_named_property(env, result, "apps", apps_array);
        return result;
    }
}

napi_value Init(napi_env env, napi_value exports) {
    napi_value fn;
    napi_create_function(env, nullptr, 0, GetApplicationsForFile, nullptr, &fn);
    napi_set_named_property(env, exports, "getApplicationsForFile", fn);
    return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
