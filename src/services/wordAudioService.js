const fsp = require("node:fs/promises");
const crypto = require("node:crypto");
const path = require("node:path");
const { HAN_CHAR_RE } = require("../utils/japanese");
const { parseWordTsv } = require("./wordReadingCoverageService");
const { normalizeTokenForFileName, selectBestAudioAsset } = require("./audioService");
const { readManifestIfExists } = require("./mediaStore");

const WORD_READING_AUDIO_CATEGORY = "word-reading";
const WORD_EXAMPLE_SENTENCE_AUDIO_CATEGORY = "word-example-sentence";
const manifestAudioIndexCache = new Map();

function cleanString(value) {
    const normalized = String(value || "").trim();
    return normalized || "";
}

function extractConstituentKanji(text) {
    return [...new Set(
        Array.from(cleanString(text))
            .filter((char) => HAN_CHAR_RE.test(char) && char !== "々")
    )];
}

function parseFocusKanjiField(value) {
    return String(value || "")
        .split("、")
        .map((entry) => entry.trim())
        .filter(Boolean);
}

function parseExampleSentenceParts(value) {
    const [japanese = "", reading = "", translation = ""] = String(value || "")
        .split(" ／ ")
        .map((part) => part.trim());
    return {
        japanese,
        reading,
        translation,
    };
}

function buildWordExampleAudioIdentityInput({
    written,
    reading,
    exampleText,
    exampleReading,
}) {
    return [
        "word-example-sentence",
        cleanString(written),
        cleanString(reading),
        cleanString(exampleText),
        cleanString(exampleReading),
    ].join("|");
}

function buildWordExampleAudioIdentityHash(input) {
    return crypto
        .createHash("sha256")
        .update(buildWordExampleAudioIdentityInput(input), "utf8")
        .digest("hex")
        .slice(0, 16);
}

function buildWordExampleAudioSourceFileName({
    hostKanji,
    written,
    reading,
    exampleText,
    exampleReading,
}) {
    const identityHash = buildWordExampleAudioIdentityHash({
        written,
        reading,
        exampleText,
        exampleReading,
    });
    const parts = [
        normalizeTokenForFileName(hostKanji),
        WORD_EXAMPLE_SENTENCE_AUDIO_CATEGORY,
        identityHash,
    ].filter(Boolean);
    return `${parts.join("-")}.wav`;
}

function buildWordAudioCandidateKanji({ written, focusKanji = [] }) {
    const candidates = [];
    for (const kanji of [...focusKanji, ...extractConstituentKanji(written)]) {
        if (kanji && !candidates.includes(kanji)) {
            candidates.push(kanji);
        }
    }
    return candidates;
}

function selectWordAudioHostKanji({ written, focusKanji = [] }) {
    return buildWordAudioCandidateKanji({ written, focusKanji })[0] || "";
}

function buildWordAudioScope({ wordTsv, limit = null, words = [] }) {
    const rows = parseWordTsv(wordTsv);
    const explicitWords = new Set((Array.isArray(words) ? words : []).map(cleanString).filter(Boolean));
    const scopedRows = rows.filter((row) => {
        if (explicitWords.size === 0) {
            return true;
        }
        return explicitWords.has(cleanString(row?.Word || row?.word));
    });
    const limitedRows = Number.isFinite(limit)
        ? scopedRows.slice(0, Math.max(1, limit))
        : scopedRows;

    return limitedRows
        .map((row) => {
            const written = cleanString(row?.Word || row?.word);
            const reading = cleanString(row?.Reading || row?.reading);
            const focusKanji = parseFocusKanjiField(row?.FocusKanji || row?.focusKanji || "");
            const hostKanji = selectWordAudioHostKanji({ written, focusKanji });
            return {
                written,
                reading,
                focusKanji,
                hostKanji,
                jlptLevel: cleanString(row?.JLPTLevel || row?.jlptLevel),
            };
        })
        .filter((entry) => entry.written && entry.reading && entry.hostKanji);
}

function buildWordExampleAudioScope({ wordTsv, limit = null, words = [] }) {
    const rows = parseWordTsv(wordTsv);
    const rowsByIdentity = new Map(rows.map((row) => [
        [
            cleanString(row?.Word || row?.word),
            cleanString(row?.Reading || row?.reading),
        ].join("|"),
        row,
    ]));

    return buildWordAudioScope({ wordTsv, limit, words })
        .map((entry) => {
            const matchingRow = rowsByIdentity.get(`${entry.written}|${entry.reading}`) || {};
            const example = parseExampleSentenceParts(matchingRow?.ExampleSentence || matchingRow?.exampleSentence || "");
            const identityHash = buildWordExampleAudioIdentityHash({
                written: entry.written,
                reading: entry.reading,
                exampleText: example.japanese,
                exampleReading: example.reading,
            });
            return {
                ...entry,
                exampleText: example.japanese,
                exampleReading: example.reading,
                exampleTranslation: example.translation,
                identityHash,
            };
        })
        .filter((entry) => entry.exampleText && entry.exampleReading);
}

async function readAudioManifest({ kanji, audioService = null, mediaRootDir = "" }) {
    if (!kanji) {
        return null;
    }

    if (typeof audioService?.getManifest === "function") {
        const manifest = await audioService.getManifest(kanji);
        if (manifest) {
            return manifest;
        }
    }

    if (!mediaRootDir) {
        return null;
    }

    return readManifestIfExists(mediaRootDir, kanji);
}

async function listManifestPaths(mediaRootDir) {
    const kanjiRoot = path.join(mediaRootDir || "", "kanji");
    const results = [];
    const queue = [kanjiRoot];

    while (queue.length > 0) {
        const current = queue.shift();
        let entries = [];
        try {
            entries = await fsp.readdir(current, { withFileTypes: true });
        } catch (err) {
            if (err && err.code === "ENOENT") {
                continue;
            }
            throw err;
        }

        for (const entry of entries) {
            const fullPath = path.join(current, entry.name);
            if (entry.isDirectory()) {
                queue.push(fullPath);
                continue;
            }
            if (entry.isFile() && entry.name === "manifest.json") {
                results.push(fullPath);
            }
        }
    }

    return results.sort((a, b) => a.localeCompare(b));
}

function buildManifestAudioIndexKey({ category, text, reading, identityHash = "" }) {
    return [
        cleanString(category),
        cleanString(text),
        cleanString(reading),
        cleanString(identityHash),
    ].join("|");
}

async function loadManifestAudioIndex(mediaRootDir = "") {
    if (!mediaRootDir) {
        return {
            byAudioKey: new Map(),
        };
    }

    const root = path.resolve(mediaRootDir);
    if (!manifestAudioIndexCache.has(root)) {
        manifestAudioIndexCache.set(root, (async () => {
            const byAudioKey = new Map();
            for (const manifestPath of await listManifestPaths(root)) {
                const manifest = JSON.parse(await fsp.readFile(manifestPath, "utf8"));
                const kanji = cleanString(manifest?.kanji);
                for (const asset of manifest?.assets?.audio || []) {
                    const key = buildManifestAudioIndexKey({
                        category: asset?.category,
                        text: asset?.text,
                        reading: asset?.reading,
                        identityHash: asset?.identityHash,
                    });
                    if (!byAudioKey.has(key)) {
                        byAudioKey.set(key, []);
                    }
                    byAudioKey.get(key).push({
                        kanji,
                        asset,
                    });
                }
            }
            return { byAudioKey };
        })());
    }

    return manifestAudioIndexCache.get(root);
}

function selectIndexedAudioAsset(index, { category, text, reading, identityHash = "" }) {
    const key = buildManifestAudioIndexKey({ category, text, reading, identityHash });
    const entries = index.byAudioKey.get(key) || [];
    const asset = selectBestAudioAsset(entries.map((entry) => entry.asset), {
        category,
        text,
        reading,
        identityHash,
    });
    if (!asset) {
        return { kanji: "", asset: null };
    }

    const entry = entries.find((candidate) => candidate.asset === asset);
    return {
        kanji: cleanString(entry?.kanji),
        asset,
    };
}

async function findManagedWordAudioAssetInAnyManifest({ written, reading, mediaRootDir = "" }) {
    if (!mediaRootDir) {
        return { kanji: "", asset: null };
    }

    const expectedWritten = cleanString(written);
    const expectedReading = cleanString(reading);
    const index = await loadManifestAudioIndex(mediaRootDir);
    return selectIndexedAudioAsset(index, {
        category: WORD_READING_AUDIO_CATEGORY,
        text: expectedWritten,
        reading: expectedReading,
    });
}

async function findManagedWordAudioAsset({ written, reading, focusKanji = [], audioService = null, mediaRootDir = "" }) {
    const expectedWritten = cleanString(written);
    const expectedReading = cleanString(reading);
    for (const kanji of buildWordAudioCandidateKanji({ written, focusKanji })) {
        const manifest = await readAudioManifest({ kanji, audioService, mediaRootDir });
        const candidateAssets = (manifest?.assets?.audio || []).filter((asset) => (
            asset?.category === WORD_READING_AUDIO_CATEGORY
            && cleanString(asset?.text) === expectedWritten
            && cleanString(asset?.reading) === expectedReading
        ));
        const asset = selectBestAudioAsset(candidateAssets, {
            category: WORD_READING_AUDIO_CATEGORY,
            text: expectedWritten,
            reading: expectedReading,
        });
        if (asset) {
            return {
                kanji,
                asset,
            };
        }
    }

    return findManagedWordAudioAssetInAnyManifest({ written, reading, mediaRootDir });
}

async function findManagedWordExampleAudioAssetInAnyManifest({
    exampleText,
    exampleReading,
    identityHash,
    mediaRootDir = "",
}) {
    if (!mediaRootDir) {
        return { kanji: "", asset: null };
    }

    const expectedText = cleanString(exampleText);
    const expectedReading = cleanString(exampleReading);
    const index = await loadManifestAudioIndex(mediaRootDir);
    return selectIndexedAudioAsset(index, {
        category: WORD_EXAMPLE_SENTENCE_AUDIO_CATEGORY,
        text: expectedText,
        reading: expectedReading,
        identityHash,
    });
}

async function findManagedWordExampleAudioAsset({
    written,
    reading,
    exampleText,
    exampleReading,
    identityHash = "",
    focusKanji = [],
    audioService = null,
    mediaRootDir = "",
}) {
    const expectedText = cleanString(exampleText);
    const expectedReading = cleanString(exampleReading);
    const expectedIdentityHash = cleanString(identityHash) || buildWordExampleAudioIdentityHash({
        written,
        reading,
        exampleText: expectedText,
        exampleReading: expectedReading,
    });
    if (!expectedText || !expectedReading) {
        return { kanji: "", asset: null };
    }

    for (const kanji of buildWordAudioCandidateKanji({ written, focusKanji })) {
        const manifest = await readAudioManifest({ kanji, audioService, mediaRootDir });
        const candidateAssets = (manifest?.assets?.audio || []).filter((asset) => (
            asset?.category === WORD_EXAMPLE_SENTENCE_AUDIO_CATEGORY
            && cleanString(asset?.text) === expectedText
            && cleanString(asset?.reading) === expectedReading
            && cleanString(asset?.identityHash) === expectedIdentityHash
        ));
        const asset = selectBestAudioAsset(candidateAssets, {
            category: WORD_EXAMPLE_SENTENCE_AUDIO_CATEGORY,
            text: expectedText,
            reading: expectedReading,
            identityHash: expectedIdentityHash,
        });
        if (asset) {
            return {
                kanji,
                asset,
            };
        }
    }

    return findManagedWordExampleAudioAssetInAnyManifest({
        exampleText,
        exampleReading,
        identityHash: expectedIdentityHash,
        mediaRootDir,
    });
}

module.exports = {
    WORD_EXAMPLE_SENTENCE_AUDIO_CATEGORY,
    WORD_READING_AUDIO_CATEGORY,
    buildWordAudioCandidateKanji,
    buildWordAudioScope,
    buildWordExampleAudioIdentityHash,
    buildWordExampleAudioSourceFileName,
    buildWordExampleAudioScope,
    cleanString,
    extractConstituentKanji,
    findManagedWordExampleAudioAsset,
    findManagedWordExampleAudioAssetInAnyManifest,
    findManagedWordAudioAsset,
    findManagedWordAudioAssetInAnyManifest,
    listManifestPaths,
    parseExampleSentenceParts,
    parseFocusKanjiField,
    selectWordAudioHostKanji,
};
