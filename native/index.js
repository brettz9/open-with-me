'use strict';

const {join} = require('node:path');

// Resolve path relative to this file's actual location (not the compiled location)
const addonPath = join(__dirname, 'build/Release/launch_services.node');

const addon = require(addonPath);

module.exports = {
  getApplicationsForFile: addon.getApplicationsForFile
};
