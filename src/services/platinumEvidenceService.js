const path = require("node:path");
const {
    loadPlatinumCardSourceManifest,
} = require("../datasets/platinumCardSourceManifest");

const DEFAULT_PLATINUM_CARD_SOURCE_MANIFEST_PATH = path.resolve(
    __dirname,
    "..",
    "..",
    "templates",
    "platinum_card_source_manifest.json"
);

let cachedPlatinumCardSourceManifest = null;

function normalizeText(value) {
    return String(value ?? "").trim();
}

function normalizeForEvidence(value) {
    return normalizeText(value)
        .replace(/<ruby>(.*?)<rt>.*?<\/rt><\/ruby>/gu, "$1")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .toLowerCase();
}

function getDefaultPlatinumCardSourceManifest() {
    if (!cachedPlatinumCardSourceManifest) {
        cachedPlatinumCardSourceManifest = loadPlatinumCardSourceManifest(DEFAULT_PLATINUM_CARD_SOURCE_MANIFEST_PATH);
    }

    return cachedPlatinumCardSourceManifest;
}

function sourceMatchesEvidenceText(source = {}, normalizedEvidenceText = "") {
    return (source.matchers || []).some((matcher) => {
        const normalizedMatcher = normalizeForEvidence(matcher);
        return normalizedMatcher && normalizedEvidenceText.includes(normalizedMatcher);
    });
}

function resolvePlatinumCardSourceMatches(sourceEvidence = [], { manifest = getDefaultPlatinumCardSourceManifest() } = {}) {
    const evidenceText = normalizeEvidenceEntries(sourceEvidence)
        .filter((entry) => entry.type === "japanese-source")
        .map((entry) => `${entry.source} ${entry.detail}`)
        .join(" ");
    const normalizedEvidenceText = normalizeForEvidence(evidenceText);

    if (!normalizedEvidenceText) {
        return [];
    }

    return Object.entries(manifest.sources || {})
        .filter(([, source]) => sourceMatchesEvidenceText(source, normalizedEvidenceText))
        .map(([sourceId, source]) => ({ sourceId, source }));
}

function extractHttpUrlHosts(value = "") {
    const hosts = [];
    const text = String(value || "");
    const urlMatches = text.matchAll(/https?:\/\/[^\s;,)]+/giu);

    for (const match of urlMatches) {
        try {
            const host = new URL(match[0]).hostname.replace(/^www\./iu, "").toLowerCase();
            if (host) {
                hosts.push(host);
            }
        } catch {
            hosts.push(match[0]);
        }
    }

    return [...new Set(hosts)].sort();
}

function buildKnownUrlHosts(manifest = getDefaultPlatinumCardSourceManifest()) {
    const hosts = new Set();

    for (const source of Object.values(manifest.sources || {})) {
        for (const matcher of source.matchers || []) {
            const normalizedMatcher = normalizeText(matcher).toLowerCase().replace(/^www\./iu, "");
            if (/^[a-z0-9.-]+\.[a-z]{2,}$/iu.test(normalizedMatcher)) {
                hosts.add(normalizedMatcher);
            }
        }
    }

    return hosts;
}

function isKnownUrlHost(host = "", knownUrlHosts = new Set()) {
    for (const knownHost of knownUrlHosts) {
        if (host === knownHost || host.endsWith(`.${knownHost}`)) {
            return true;
        }
    }

    return false;
}

function sourceAllowsUse(source = {}, use = "") {
    return source.status === "active" && (source.allowedUse || []).includes(use);
}

function buildSourceIndependenceGroups(sourceId, source = {}) {
    return [
        sourceId,
        source.sourceFamily,
        source.independenceGroup,
    ].filter(Boolean);
}

function resolveRequiredJapaneseSourceUse(context = "", requiredUse = "") {
    if (requiredUse) {
        return requiredUse;
    }

    const normalizedContext = normalizeForEvidence(context);
    if (normalizedContext.includes("word")) {
        return "word-field-verification";
    }
    if (normalizedContext.includes("kanji")) {
        return "kanji-field-verification";
    }
    return "word-field-verification";
}

function normalizeEvidenceEntries(value) {
    return (Array.isArray(value) ? value : [])
        .filter((entry) => entry && typeof entry === "object" && !Array.isArray(entry))
        .map((entry) => ({
            type: normalizeText(entry.type),
            source: normalizeText(entry.source),
            detail: normalizeText(entry.detail),
        }));
}

function buildEvidenceTextByType(sourceEvidence = []) {
    const entries = normalizeEvidenceEntries(sourceEvidence);
    const byType = new Map();

    for (const entry of entries) {
        const type = normalizeText(entry.type);
        const text = `${entry.source} ${entry.detail}`.trim();
        byType.set(type, `${byType.get(type) || ""} ${text}`.trim());
    }

    return byType;
}

function validateJapaneseSourceEvidence(sourceEvidence = [], {
    context = "platinum card accuracy",
    manifest = getDefaultPlatinumCardSourceManifest(),
    alternativeRequiredUses = [],
    requiredUse = "",
    sourceOriginIds = [],
} = {}) {
    const japaneseEvidenceText = normalizeEvidenceEntries(sourceEvidence)
        .filter((entry) => entry.type === "japanese-source")
        .map((entry) => `${entry.source} ${entry.detail}`)
        .join(" ");

    if (!normalizeText(japaneseEvidenceText)) {
        return [];
    }

    const failures = [];
    const requiredSourceUse = resolveRequiredJapaneseSourceUse(context, requiredUse);
    const acceptedSourceUses = [
        requiredSourceUse,
        ...(Array.isArray(alternativeRequiredUses) ? alternativeRequiredUses : []),
    ].filter(Boolean);
    const sourceMatches = resolvePlatinumCardSourceMatches(sourceEvidence, { manifest });
    const fieldVerificationSources = sourceMatches.filter(({ source }) => (
        acceptedSourceUses.some((use) => sourceAllowsUse(source, use))
    ));
    const knownUrlHosts = buildKnownUrlHosts(manifest);
    const unknownUrlHosts = extractHttpUrlHosts(japaneseEvidenceText)
        .filter((host) => !isKnownUrlHost(host, knownUrlHosts));

    if (unknownUrlHosts.length > 0) {
        failures.push(`japanese-source evidence cites unregistered URL host(s) for ${context}: ${unknownUrlHosts.join(", ")}`);
    }

    if (fieldVerificationSources.length === 0) {
        failures.push(`japanese-source evidence must cite a governed source allowed for ${acceptedSourceUses.join(" or ")} for ${context}; generated output, golden fixtures, tracked starter data, source-governance manifests, source-claim lists, and local caches are not sufficient by themselves`);
    }

    const normalizedOriginIds = [...new Set((Array.isArray(sourceOriginIds) ? sourceOriginIds : [])
        .map((sourceId) => normalizeText(sourceId))
        .filter(Boolean))]
        .sort();

    if (normalizedOriginIds.length > 0) {
        const unknownOriginIds = normalizedOriginIds.filter((sourceId) => !manifest.sources?.[sourceId]);
        if (unknownOriginIds.length > 0) {
            failures.push(`japanese-source evidence references unregistered source-claim origin id(s): ${unknownOriginIds.join(", ")}`);
        } else if (fieldVerificationSources.length > 0) {
            const originGroups = new Set(normalizedOriginIds.flatMap((sourceId) => (
                buildSourceIndependenceGroups(sourceId, manifest.sources[sourceId])
            )));
            const independentFieldSources = fieldVerificationSources.filter(({ sourceId, source }) => (
                buildSourceIndependenceGroups(sourceId, source).every((group) => !originGroups.has(group))
            ));

            if (independentFieldSources.length === 0) {
                failures.push(`japanese-source field verification for ${context} must be independent of source-claim origin(s): ${normalizedOriginIds.join(", ")}`);
            }
        }
    }

    return failures;
}

function validateEvidenceSnippets({
    sourceEvidence = [],
    type = "",
    snippets = [],
    label = "",
} = {}) {
    const normalizedType = normalizeText(type);
    const evidenceText = buildEvidenceTextByType(sourceEvidence).get(normalizedType) || "";
    const normalizedEvidence = normalizeForEvidence(evidenceText);
    const failures = [];

    for (const snippet of snippets) {
        const normalizedSnippet = normalizeForEvidence(snippet);
        if (!normalizedSnippet) {
            continue;
        }
        if (!normalizedEvidence.includes(normalizedSnippet)) {
            failures.push(`${normalizedType} evidence must explicitly support ${label || "field"}: ${normalizeText(snippet)}`);
        }
    }

    return failures;
}

module.exports = {
    DEFAULT_PLATINUM_CARD_SOURCE_MANIFEST_PATH,
    buildEvidenceTextByType,
    extractHttpUrlHosts,
    getDefaultPlatinumCardSourceManifest,
    isKnownUrlHost,
    normalizeEvidenceEntries,
    normalizeForEvidence,
    resolvePlatinumCardSourceMatches,
    validateEvidenceSnippets,
    validateJapaneseSourceEvidence,
};
