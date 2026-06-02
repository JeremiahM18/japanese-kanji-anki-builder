const fs = require("node:fs");
const path = require("node:path");

function buildDefaultSecurityRequirementsTraceabilityPath() {
    return path.resolve(__dirname, "../../templates/security_requirements_traceability.json");
}

function loadSecurityRequirementsTraceability(traceabilityPath = buildDefaultSecurityRequirementsTraceabilityPath()) {
    const resolvedPath = path.resolve(traceabilityPath);
    const raw = JSON.parse(fs.readFileSync(resolvedPath, "utf-8"));

    return {
        ...raw,
        traceabilityPath: resolvedPath,
    };
}

module.exports = {
    buildDefaultSecurityRequirementsTraceabilityPath,
    loadSecurityRequirementsTraceability,
};
