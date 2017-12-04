"use strict";

const transformResources = require("./transform-resources");

class ServerlessPlugin {
  constructor(serverless, options) {
    transformResources.transformDdbTables(serverless);
  }
}

module.exports = ServerlessPlugin;
