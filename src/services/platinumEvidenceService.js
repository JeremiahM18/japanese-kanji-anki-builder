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

const JAPANESE_SOURCE_MARKERS = Object.freeze([
    "jmdict",
    "jisho.org",
    "weblio",
    "goo辞書",
    "dictionary.goo.ne.jp",
    "デジタル大辞泉",
    "大辞泉",
    "大辞林",
    "明鏡",
    "新明解",
    "三省堂",
    "nhk",
    "ojad",
    "tatoeba",
    "jlearn.net",
    "japandict.com",
    "japaneseclass.jp",
    "nihongomaster.com",
    "kotobank.jp",
    "kaikki.org",
    "wiktionary.org",
    "practice-japanese.com",
    "benkyoumashou.com",
    "bunpro.jp",
    "tkgje.jp",
    "gogen-yurai.jp",
    "jlptglobal.com",
    "mlcjapanese.co.jp",
    "thejapanesepage.com",
    "tofugu.com",
    "nihoner.com",
    "kanjipedia.jp",
    "漢字ペディア",
    "bunka.go.jp",
    "joyokanjihyo",
    "joyo kanji",
    "常用漢字",
    "文化庁",
]);

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

function validateJapaneseSourceEvidence(sourceEvidence = [], { context = "platinum card accuracy" } = {}) {
    const japaneseEvidenceText = normalizeEvidenceEntries(sourceEvidence)
        .filter((entry) => entry.type === "japanese-source")
        .map((entry) => `${entry.source} ${entry.detail}`)
        .join(" ");

    if (!normalizeText(japaneseEvidenceText)) {
        return [];
    }

    const normalizedEvidenceText = normalizeForEvidence(japaneseEvidenceText);
    const hasVerifiableSource = JAPANESE_SOURCE_MARKERS.some((marker) => (
        normalizedEvidenceText.includes(normalizeForEvidence(marker))
    ));

    return hasVerifiableSource
        ? []
        : [`japanese-source evidence must cite a non-generated Japanese/reference/dictionary source for ${context}; generated output, golden fixtures, tracked starter data, source-governance manifests, and local caches are not sufficient by themselves`];
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
    JAPANESE_SOURCE_MARKERS,
    buildEvidenceTextByType,
    normalizeEvidenceEntries,
    normalizeForEvidence,
    validateEvidenceSnippets,
    validateJapaneseSourceEvidence,
};
