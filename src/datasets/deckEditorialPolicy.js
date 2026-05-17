const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_POLICY_PATH = path.resolve(__dirname, "..", "..", "templates", "deck_editorial_policy.json");

function compilePolicyRegex(entry) {
    if (!entry || typeof entry.pattern !== "string" || !entry.pattern.trim()) {
        throw new Error("Editorial policy regex entries require a non-empty pattern.");
    }

    return new RegExp(entry.pattern, entry.flags || "");
}

function compilePolicyRegexList(entries = []) {
    if (!Array.isArray(entries)) {
        throw new Error("Editorial policy regex lists must be arrays.");
    }

    return entries.map((entry) => compilePolicyRegex(entry));
}

function loadDeckEditorialPolicy(policyPath = DEFAULT_POLICY_PATH) {
    const policy = JSON.parse(fs.readFileSync(policyPath, "utf-8"));

    if (policy.schemaVersion !== 1) {
        throw new Error(`Unsupported deck editorial policy schemaVersion: ${policy.schemaVersion}`);
    }

    return policy;
}

module.exports = {
    compilePolicyRegexList,
    loadDeckEditorialPolicy,
};
