#!/usr/bin/env node

const { invokeCliMain } = require("../src/utils/cliArgs");
const service = require("../src/services/githubRepositorySettingsAuthenticatedAuditCommandService");

if (require.main === module) {
    invokeCliMain(() => service.main()).catch((error) => {
        console.error(error.message || error);
        process.exitCode = 1;
    });
}

module.exports = service;
