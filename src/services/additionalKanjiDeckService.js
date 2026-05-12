const path = require("node:path");

const { loadAnkiNoteSchema } = require("../config/ankiNoteSchema");
const { tsvEscape } = require("../utils/text");

const ADDITIONAL_KANJI_DECK_KIND = "kanji-additional";
const ADDITIONAL_KANJI_EXPORT_PREFIX = "additional-unverified";

const CATEGORY_RANK = Object.freeze({
    source_consensus_candidate: 3,
    source_claim_consensus_elsewhere: 2,
    source_claim_no_consensus: 1,
    disputed_source_claim: 0,
});

const CONFIDENCE_RANK = Object.freeze({
    high_confidence: 3,
    standard_confidence: 2,
    weak_evidence: 1,
    unknown: 0,
});

function buildAdditionalKanjiExportFileName(level) {
    return `${ADDITIONAL_KANJI_EXPORT_PREFIX}-n${level}.tsv`;
}

function buildAdditionalKanjiExportPath(outDir, level) {
    return path.join(outDir, "exports", buildAdditionalKanjiExportFileName(level));
}

function compareEntryPriority(left = {}, right = {}) {
    const leftRank = CATEGORY_RANK[left.category] || 0;
    const rightRank = CATEGORY_RANK[right.category] || 0;
    if (leftRank !== rightRank) {
        return rightRank - leftRank;
    }

    const leftConfidence = CONFIDENCE_RANK[left.confidence] || 0;
    const rightConfidence = CONFIDENCE_RANK[right.confidence] || 0;
    if (leftConfidence !== rightConfidence) {
        return rightConfidence - leftConfidence;
    }

    const leftTarget = Number(left.targetLevel) || 0;
    const rightTarget = Number(right.targetLevel) || 0;
    if (leftTarget !== rightTarget) {
        return rightTarget - leftTarget;
    }

    return String(left.kanji || "").localeCompare(String(right.kanji || ""), "ja");
}

function flattenAdditionalEntries(additionalDecks = []) {
    return (Array.isArray(additionalDecks) ? additionalDecks : [])
        .flatMap((deck) => (deck.entries || []).map((entry) => ({
            ...entry,
            deckId: deck.deckId,
            level: deck.level,
        })));
}

function buildEntriesByKanji(additionalDecks = []) {
    const entriesByKanji = new Map();
    for (const entry of flattenAdditionalEntries(additionalDecks)) {
        if (!entriesByKanji.has(entry.kanji)) {
            entriesByKanji.set(entry.kanji, []);
        }
        entriesByKanji.get(entry.kanji).push(entry);
    }
    return entriesByKanji;
}

function selectPhysicalAdditionalEntries(additionalDecks = [], { duplicatePolicy = "core-only" } = {}) {
    if (!["core-only", "select-best"].includes(duplicatePolicy)) {
        throw new Error(`Unsupported additional kanji duplicate policy: ${duplicatePolicy}`);
    }

    const selectedByKanji = new Map();
    const excludedDuplicateClaims = [];
    const suppressedDuplicateClaims = [];
    const coreRetainedDuplicateKanji = [];

    for (const [kanji, entries] of buildEntriesByKanji(additionalDecks)) {
        if (entries.length > 1 && duplicatePolicy !== "select-best") {
            if (entries.some((entry) => Number(entry.currentContractLevel))) {
                coreRetainedDuplicateKanji.push(kanji);
            }
            suppressedDuplicateClaims.push(...entries);
            continue;
        }

        for (const entry of entries) {
            const previous = selectedByKanji.get(entry.kanji);
            if (!previous) {
                selectedByKanji.set(entry.kanji, entry);
                continue;
            }

            const [selected, excluded] = compareEntryPriority(entry, previous) < 0
                ? [entry, previous]
                : [previous, entry];
            selectedByKanji.set(entry.kanji, selected);
            excludedDuplicateClaims.push(excluded);
        }
    }

    const selectedEntries = [...selectedByKanji.values()]
        .sort((a, b) => (
            Number(b.targetLevel || 0) - Number(a.targetLevel || 0)
            || String(a.kanji || "").localeCompare(String(b.kanji || ""), "ja")
        ));
    const entriesByLevel = new Map();
    for (const entry of selectedEntries) {
        const level = Number(entry.targetLevel);
        if (!entriesByLevel.has(level)) {
            entriesByLevel.set(level, []);
        }
        entriesByLevel.get(level).push(entry);
    }

    return {
        selectedEntries,
        entriesByLevel,
        excludedDuplicateClaims: excludedDuplicateClaims.sort(compareEntryPriority),
        suppressedDuplicateClaims: suppressedDuplicateClaims.sort(compareEntryPriority),
        coreRetainedDuplicateKanji: coreRetainedDuplicateKanji.sort((a, b) => a.localeCompare(b, "ja")),
    };
}

function buildAdditionalJlptDataset({ baseJlptOnlyJson = {}, entries = [] } = {}) {
    const dataset = {};
    for (const entry of entries) {
        const kanji = String(entry.kanji || "").trim();
        if (!kanji) {
            continue;
        }
        const baseEntry = baseJlptOnlyJson[kanji] || { kanji };
        dataset[kanji] = {
            ...baseEntry,
            kanji,
            jlpt: Number(entry.targetLevel),
        };
    }
    return dataset;
}

function parseTsv(text = "") {
    const lines = String(text || "")
        .trim()
        .split(/\r?\n/u)
        .filter(Boolean);
    if (lines.length === 0) {
        return { header: [], rows: [] };
    }

    return {
        header: lines[0].split("\t"),
        rows: lines.slice(1).map((line) => line.split("\t")),
    };
}

function serializeTsv({ header = [], rows = [] } = {}) {
    return [
        header.map(tsvEscape).join("\t"),
        ...rows.map((row) => row.map(tsvEscape).join("\t")),
    ].join("\n");
}

function formatLevel(level) {
    const numericLevel = Number(level);
    return [1, 2, 3, 4, 5].includes(numericLevel) ? `N${numericLevel}` : "unknown";
}

function formatAdditionalNote(entry = {}) {
    const sourceIds = (entry.sourceIds || []).join(", ") || "none";
    return [
        `Additional unverified ${formatLevel(entry.targetLevel)} source claim.`,
        `Current core placement: ${formatLevel(entry.currentContractLevel)}.`,
        `Source consensus: ${formatLevel(entry.sourceConsensusLevel)}.`,
        `Confidence: ${entry.confidence || "unknown"}.`,
        `Category: ${entry.category || "unknown"}.`,
        `Source lanes: ${sourceIds}.`,
    ].join(" ");
}

function annotateAdditionalKanjiTsv({ tsv, entriesByKanji = new Map() } = {}) {
    const parsed = parseTsv(tsv);
    const fieldNames = loadAnkiNoteSchema().fieldNames;
    const kanjiIndex = parsed.header.indexOf("Kanji");
    const notesIndex = parsed.header.indexOf("Notes");
    for (const required of ["Kanji", "Notes"]) {
        if (!parsed.header.includes(required) || !fieldNames.includes(required)) {
            throw new Error(`Additional kanji TSV is missing required ${required} field.`);
        }
    }

    const rows = parsed.rows.map((row) => {
        const next = [...row];
        const entry = entriesByKanji.get(next[kanjiIndex]);
        if (!entry) {
            return next;
        }

        const existingNotes = String(next[notesIndex] || "").trim();
        const additionalNote = formatAdditionalNote(entry);
        next[notesIndex] = existingNotes ? `${existingNotes} ${additionalNote}` : additionalNote;
        return next;
    });

    return serializeTsv({ header: parsed.header, rows });
}

module.exports = {
    ADDITIONAL_KANJI_DECK_KIND,
    buildAdditionalJlptDataset,
    buildAdditionalKanjiExportFileName,
    buildAdditionalKanjiExportPath,
    annotateAdditionalKanjiTsv,
    buildEntriesByKanji,
    compareEntryPriority,
    formatAdditionalNote,
    parseTsv,
    selectPhysicalAdditionalEntries,
};
