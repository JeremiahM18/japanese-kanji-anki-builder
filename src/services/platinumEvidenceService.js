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
    buildEvidenceTextByType,
    normalizeEvidenceEntries,
    normalizeForEvidence,
    validateEvidenceSnippets,
};
