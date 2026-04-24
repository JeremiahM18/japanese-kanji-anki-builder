const { HAN_CHAR_RE } = require("../utils/japanese");
const { parseWordTsv } = require("./wordReadingCoverageService");
const { selectBestAudioAsset } = require("./audioService");
const { readManifestIfExists } = require("./mediaStore");

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

async function findManagedWordAudioAsset({ written, reading, focusKanji = [], audioService = null, mediaRootDir = "" }) {
    const expectedWritten = cleanString(written);
    const expectedReading = cleanString(reading);
    for (const kanji of buildWordAudioCandidateKanji({ written, focusKanji })) {
        const manifest = await readAudioManifest({ kanji, audioService, mediaRootDir });
        const candidateAssets = (manifest?.assets?.audio || []).filter((asset) => (
            asset?.category === "word-reading"
            && cleanString(asset?.text) === expectedWritten
            && cleanString(asset?.reading) === expectedReading
        ));
        const asset = selectBestAudioAsset(candidateAssets, {
            category: "word-reading",
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

    return {
        kanji: "",
        asset: null,
    };
}

module.exports = {
    buildWordAudioCandidateKanji,
    buildWordAudioScope,
    cleanString,
    extractConstituentKanji,
    findManagedWordAudioAsset,
    parseFocusKanjiField,
    selectWordAudioHostKanji,
};
