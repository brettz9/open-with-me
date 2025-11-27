'use strict';

// @ts-expect-error - Native addon .node file has no type declarations
const addon = require('./build/Release/launch_services.node');

module.exports = {
  getApplicationsForFile: addon.getApplicationsForFile
};
