const fs = require("node:fs");
const path = require("node:path");

function resolveTriagePath(triagePath) {
    const explicitPath = String(triagePath || "").trim();
    if (explicitPath) {
        return path.resolve(process.cwd(), explicitPath);
    }

    const defaultPath = path.resolve(process.cwd(), "templates", "word_inventory_expansion_triage.json");
    return fs.existsSync(defaultPath) ? defaultPath : "";
}

function loadTriageDecisions({ triagePath, level, sourceLabel } = {}) {
    const resolvedPath = resolveTriagePath(triagePath);
    if (!resolvedPath) {
        return {};
    }
    if (!fs.existsSync(resolvedPath)) {
        throw new Error(`Expansion triage file does not exist: ${resolvedPath}`);
    }

    const triage = JSON.parse(fs.readFileSync(resolvedPath, "utf8"));
    const levelLabel = `N${level}`;
    return triage?.[levelLabel]?.[sourceLabel] || triage?.[levelLabel]?._default || {};
}

module.exports = {
    loadTriageDecisions,
    resolveTriagePath,
};
