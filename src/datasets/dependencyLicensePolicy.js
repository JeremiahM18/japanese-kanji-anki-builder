const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_DEPENDENCY_LICENSE_POLICY_PATH = path.resolve(
    __dirname,
    "..",
    "..",
    "templates",
    "dependency_license_policy.json"
);

function loadDependencyLicensePolicy({ policyPath = DEFAULT_DEPENDENCY_LICENSE_POLICY_PATH } = {}) {
    return JSON.parse(fs.readFileSync(policyPath, "utf-8"));
}

function resolveDependencyLicensePolicyPath(cwd = process.cwd(), policyPath = undefined) {
    if (!policyPath) {
        return DEFAULT_DEPENDENCY_LICENSE_POLICY_PATH;
    }
    return path.isAbsolute(policyPath)
        ? policyPath
        : path.resolve(cwd, policyPath);
}

module.exports = {
    DEFAULT_DEPENDENCY_LICENSE_POLICY_PATH,
    loadDependencyLicensePolicy,
    resolveDependencyLicensePolicyPath,
};
