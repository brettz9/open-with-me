{
  "targets": [
    {
      "target_name": "launch_services",
      "sources": [ "src/launch_services.mm" ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")"
      ],
      "dependencies": [
        "<!(node -p \"require('node-addon-api').gyp\")"
      ],
      "defines": [ "NAPI_DISABLE_CPP_EXCEPTIONS" ],
      "xcode_settings": {
        "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
        "CLANG_CXX_LIBRARY": "libc++",
        "MACOSX_DEPLOYMENT_TARGET": "10.15",
        "OTHER_CFLAGS": [
          "-x objective-c++"
        ]
      },
      "link_settings": {
        "libraries": [
          "-framework CoreServices",
          "-framework Foundation",
          "-framework AppKit"
        ]
      }
    }
  ]
}
