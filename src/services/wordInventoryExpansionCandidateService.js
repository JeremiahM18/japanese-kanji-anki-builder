const { buildWordStudyEntryKey } = require("../datasets/wordStudyData");
const { extractConstituentKanji, isLikelyPhraseCard } = require("./wordExportService");

const LEVEL_RE = /^\s*(?:jlpt\s*)?n?\s*([1-5])\s*$/i;
const TRIAGE_DECISIONS = new Set(["keep_candidate", "move_candidate", "defer_candidate", "reject_candidate"]);

function normalizePlacementMode(value = "kanji-anchor") {
    const mode = String(value || "kanji-anchor").trim();
    if (mode === "kanji-anchor" || mode === "vocabulary-level") {
        return mode;
    }
    throw new Error("Word inventory expansion placementMode must be one of: kanji-anchor, vocabulary-level.");
}

function normalizeHeader(value) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[\s_-]+/g, "");
}

function parseSourceLevel(value) {
    const text = String(value ?? "").trim();
    if (!text) {
        return null;
    }

    const match = text.match(LEVEL_RE);
    if (!match) {
        return null;
    }

    return Number(match[1]);
}

function pickField(row, names) {
    for (const name of names) {
        if (row[name] !== undefined && row[name] !== null && String(row[name]).trim()) {
            return String(row[name]).trim();
        }
    }
    return "";
}

function parseDelimitedLine(line, delimiter) {
    const cells = [];
    let current = "";
    let quoted = false;

    for (let index = 0; index < line.length; index += 1) {
        const char = line[index];
        const next = line[index + 1];

        if (char === "\"") {
            if (quoted && next === "\"") {
                current += "\"";
                index += 1;
            } else {
                quoted = !quoted;
            }
            continue;
        }

        if (char === delimiter && !quoted) {
            cells.push(current);
            current = "";
            continue;
        }

        current += char;
    }

    cells.push(current);
    return cells.map((cell) => cell.trim());
}

function parseDelimitedRows(text, { delimiter = null } = {}) {
    const lines = String(text || "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

    if (lines.length === 0) {
        return [];
    }

    const chosenDelimiter = delimiter || (lines[0].includes("\t") ? "\t" : ",");
    const headers = parseDelimitedLine(lines[0], chosenDelimiter).map(normalizeHeader);

    return lines.slice(1).map((line) => {
        const cells = parseDelimitedLine(line, chosenDelimiter);
        return headers.reduce((row, header, index) => {
            if (header) {
                row[header] = cells[index] || "";
            }
            return row;
        }, {});
    });
}

function parseJsonRows(text) {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
        return parsed;
    }
    for (const key of ["entries", "words", "items", "rows"]) {
        if (Array.isArray(parsed?.[key])) {
            return parsed[key];
        }
    }
    throw new Error("JSON candidate source must be an array or contain entries, words, items, or rows.");
}

function parseCandidateSourceText(text, { format = "auto" } = {}) {
    const trimmed = String(text || "").trim();
    if (!trimmed) {
        return [];
    }

    const normalizedFormat = String(format || "auto").toLowerCase();
    if (normalizedFormat === "json" || (normalizedFormat === "auto" && /^[\[{]/.test(trimmed))) {
        return parseJsonRows(trimmed);
    }
    if (normalizedFormat === "tsv") {
        return parseDelimitedRows(trimmed, { delimiter: "\t" });
    }
    if (normalizedFormat === "csv") {
        return parseDelimitedRows(trimmed, { delimiter: "," });
    }
    if (normalizedFormat === "auto") {
        return parseDelimitedRows(trimmed);
    }

    throw new Error("Candidate source format must be one of: auto, json, tsv, csv.");
}

function normalizeCandidateSourceRow(row, { sourceLabel = "external" } = {}) {
    const normalized = {};
    for (const [key, value] of Object.entries(row || {})) {
        normalized[normalizeHeader(key)] = value;
    }

    const written = pickField(normalized, ["written", "word", "expression", "term", "vocabulary", "japanese"]);
    const reading = pickField(normalized, ["reading", "kana", "pronunciation", "pronounced", "furigana"]);
    const meaning = pickField(normalized, ["meaning", "meanings", "gloss", "english", "definition"]);
    const source = pickField(normalized, ["source", "sourcename"]) || sourceLabel;
    const notes = pickField(normalized, ["notes", "note"]);
    const level = parseSourceLevel(pickField(normalized, ["jlpt", "level", "jlptlevel"]));
    const frequencyRank = Number.parseInt(pickField(normalized, ["frequencyrank", "frequency", "rank"]), 10);

    if (!written || !reading) {
        return null;
    }

    return {
        written,
        reading,
        meaning,
        source,
        notes,
        sourceLevel: Number.isInteger(level) ? level : null,
        frequencyRank: Number.isInteger(frequencyRank) ? frequencyRank : null,
        key: buildWordStudyEntryKey({ written, reading }),
    };
}

function splitReadingVariants(reading) {
    const variants = String(reading || "")
        .split(/[\/／]/u)
        .map((variant) => variant.trim())
        .filter(Boolean);

    return variants.length > 0 ? variants : [String(reading || "").trim()];
}

function normalizeCandidateSourceRows(row, { sourceLabel = "external" } = {}) {
    const normalized = normalizeCandidateSourceRow(row, { sourceLabel });
    if (!normalized) {
        return [];
    }

    return splitReadingVariants(normalized.reading).map((reading) => ({
        ...normalized,
        reading,
        sourceReading: normalized.reading,
        key: buildWordStudyEntryKey({ written: normalized.written, reading }),
    }));
}

function getKanjiLevel(kanji, jlptLevelContract = {}) {
    const level = jlptLevelContract?.kanjiLevels?.[kanji];
    return Number.isInteger(level) ? level : null;
}

function isSourceTemplateRow(row) {
    return /[～~]/u.test(String(row?.written || "")) || /[～~]/u.test(String(row?.reading || ""));
}

function classifyKanjiScope(row, { targetLevel, jlptLevelContract }) {
    const constituentKanji = extractConstituentKanji(row.written);
    const kanjiLevels = constituentKanji.map((kanji) => ({
        kanji,
        level: getKanjiLevel(kanji, jlptLevelContract),
    }));
    const targetKanji = kanjiLevels.filter((entry) => entry.level === targetLevel);
    const harderKanji = kanjiLevels.filter((entry) => Number.isInteger(entry.level) && entry.level < targetLevel);
    const easierKanji = kanjiLevels.filter((entry) => Number.isInteger(entry.level) && entry.level > targetLevel);
    const outsideJlptKanji = kanjiLevels.filter((entry) => !Number.isInteger(entry.level));

    return {
        constituentKanji,
        kanjiLevels,
        targetKanji,
        easierKanji,
        harderKanji,
        outsideJlptKanji,
    };
}

function rowMatchesKanjiScope(scope, kanjiScope) {
    if (scope.constituentKanji.length === 0 || scope.targetKanji.length === 0) {
        return false;
    }

    if (kanjiScope === "any") {
        return true;
    }

    if (kanjiScope === "known-jlpt") {
        return scope.outsideJlptKanji.length === 0;
    }

    if (kanjiScope === "at-or-below") {
        return scope.harderKanji.length === 0 && scope.outsideJlptKanji.length === 0;
    }

    if (kanjiScope === "target-level") {
        return scope.constituentKanji.length === scope.targetKanji.length;
    }

    throw new Error("kanjiScope must be one of: at-or-below, target-level, known-jlpt, any.");
}

function classifyCandidateDisposition(row, {
    targetLevel,
    kanjiScope,
    jlptLevelContract,
    jlptWordLevelContract,
    requireSourceLevel = false,
    placementMode = "kanji-anchor",
}) {
    const scope = classifyKanjiScope(row, { targetLevel, jlptLevelContract });
    const governedEntry = jlptWordLevelContract?.wordLevels?.[row.key] || null;
    const excludedEntry = jlptWordLevelContract?.excludedWordLevels?.[row.key] || null;
    const normalizedPlacementMode = normalizePlacementMode(placementMode);

    if (governedEntry) {
        return {
            disposition: "already_governed",
            reason: `already governed in N${governedEntry.jlpt}`,
            scope,
        };
    }
    if (excludedEntry) {
        return {
            disposition: "already_excluded",
            reason: `already tracked as excluded: ${excludedEntry.exclusionReason}`,
            scope,
        };
    }
    if (requireSourceLevel && row.sourceLevel !== targetLevel) {
        return {
            disposition: "source_level_mismatch",
            reason: `source level is ${row.sourceLevel ? `N${row.sourceLevel}` : "missing"}, not N${targetLevel}`,
            scope,
        };
    }
    if (isSourceTemplateRow(row)) {
        return {
            disposition: "source_template",
            reason: "source row is a template, suffix, prefix, or counter pattern rather than an exact word identity",
            scope,
        };
    }
    if (scope.constituentKanji.length === 0) {
        return {
            disposition: "kana_only",
            reason: "does not contain kanji",
            scope,
        };
    }
    if (isLikelyPhraseCard(row)) {
        return {
            disposition: "likely_phrase",
            reason: "looks phrase-shaped rather than lexicalized",
            scope,
        };
    }
    if (normalizedPlacementMode === "vocabulary-level") {
        const reviewNeeds = [];
        if (scope.harderKanji.length > 0) {
            reviewNeeds.push(`harder support-kanji labels ${scope.harderKanji.map((entry) => `${entry.kanji}=N${entry.level}`).join(", ")}`);
        }
        if (scope.outsideJlptKanji.length > 0) {
            reviewNeeds.push(`outside-JLPT labels ${scope.outsideJlptKanji.map((entry) => entry.kanji).join(", ")}`);
        }
        if (scope.targetKanji.length === 0) {
            reviewNeeds.push(`no N${targetLevel} kanji anchor; vocabulary-level placement reason required`);
        }

        return {
            disposition: "review_candidate",
            reason: "not governed yet; source-listed vocabulary fits the requested JLPT vocabulary level and needs editorial review"
                + (reviewNeeds.length > 0 ? `; ${reviewNeeds.join("; ")}` : ""),
            scope,
        };
    }
    if (scope.targetKanji.length === 0) {
        return {
            disposition: "no_target_kanji",
            reason: `does not contain N${targetLevel} kanji`,
            scope,
        };
    }
    if (!rowMatchesKanjiScope(scope, kanjiScope)) {
        const issues = [];
        if (scope.harderKanji.length > 0) {
            issues.push(`harder kanji ${scope.harderKanji.map((entry) => `${entry.kanji}=N${entry.level}`).join(", ")}`);
        }
        if (scope.outsideJlptKanji.length > 0) {
            issues.push(`outside-JLPT kanji ${scope.outsideJlptKanji.map((entry) => entry.kanji).join(", ")}`);
        }
        if (kanjiScope === "target-level" && scope.easierKanji.length > 0) {
            issues.push(`easier-level kanji ${scope.easierKanji.map((entry) => `${entry.kanji}=N${entry.level}`).join(", ")}`);
        }
        return {
            disposition: "kanji_scope_mismatch",
            reason: issues.join("; ") || `does not match ${kanjiScope} kanji scope`,
            scope,
        };
    }

    const reviewNeeds = [];
    if (scope.harderKanji.length > 0) {
        reviewNeeds.push(`harder kanji labels ${scope.harderKanji.map((entry) => `${entry.kanji}=N${entry.level}`).join(", ")}`);
    }
    if (scope.outsideJlptKanji.length > 0) {
        reviewNeeds.push(`outside-JLPT labels ${scope.outsideJlptKanji.map((entry) => entry.kanji).join(", ")}`);
    }

    return {
        disposition: "review_candidate",
        reason: "not governed yet; source-listed word fits the requested kanji scope and needs editorial review"
            + (reviewNeeds.length > 0 ? `; ${reviewNeeds.join("; ")}` : ""),
        scope,
    };
}

function resolveCrossLevelRoutingTargetLevel(scope, targetLevel) {
    if (!scope || !Number.isInteger(targetLevel) || targetLevel < 1 || targetLevel > 5) {
        return null;
    }
    if (scope.targetKanji.length > 0 || scope.outsideJlptKanji.length > 0) {
        return null;
    }

    const harderLevels = scope.harderKanji
        .map((entry) => entry.level)
        .filter((level) => Number.isInteger(level) && level >= 1 && level < targetLevel);

    if (harderLevels.length === 0) {
        return null;
    }

    return Math.max(...harderLevels);
}

function summarizeDispositions(rows) {
    return rows.reduce((summary, row) => {
        summary[row.disposition] = (summary[row.disposition] || 0) + 1;
        return summary;
    }, {});
}

function summarizeCandidateTriage(rows) {
    return rows.reduce((summary, row) => {
        const decision = row.triageDecision?.decision || "untriaged";
        summary[decision] = (summary[decision] || 0) + 1;
        return summary;
    }, {});
}

function buildSameWrittenContractIndex(jlptWordLevelContract = {}) {
    const index = new Map();

    function addEntries(entries = {}, type) {
        for (const [key, entry] of Object.entries(entries || {})) {
            const written = String(entry?.written || key.split("|")[0] || "").trim();
            const reading = String(entry?.reading || key.split("|")[1] || "").trim();
            if (!written || !reading) {
                continue;
            }
            if (!index.has(written)) {
                index.set(written, []);
            }
            index.get(written).push({
                key,
                reading,
                jlpt: Number.isInteger(entry?.jlpt) ? entry.jlpt : null,
                exclusionReason: entry?.exclusionReason || "",
                type,
            });
        }
    }

    addEntries(jlptWordLevelContract.wordLevels, "governed");
    addEntries(jlptWordLevelContract.excludedWordLevels, "excluded");

    return index;
}

function findSameWrittenContractEntries(row, sameWrittenIndex) {
    return (sameWrittenIndex.get(row.written) || [])
        .filter((entry) => entry.key !== row.key)
        .sort((a, b) => (
            a.type.localeCompare(b.type)
            || a.reading.localeCompare(b.reading, "ja")
        ));
}

function compareCandidateRows(a, b) {
    return (
        a.firstSeenIndex - b.firstSeenIndex
        || a.written.localeCompare(b.written, "ja")
        || a.reading.localeCompare(b.reading, "ja")
    );
}

function normalizeMoveTargetLevel(value) {
    const match = String(value ?? "").trim().match(/^(?:jlpt\s*)?n?\s*([1-5])$/i);
    return match ? Number(match[1]) : null;
}

function normalizeTriageDecisionCore(decision, { key = "", currentLevel = null } = {}) {
    if (!decision || typeof decision !== "object") {
        return null;
    }
    const normalizedDecision = String(decision.decision || "").trim();
    const reason = String(decision.reason || "").trim();
    if (!normalizedDecision || !reason) {
        return null;
    }
    if (!TRIAGE_DECISIONS.has(normalizedDecision)) {
        const context = key ? ` for ${key}` : "";
        throw new Error(`Unsupported word expansion triage decision${context}: ${normalizedDecision}. Expected one of: ${[...TRIAGE_DECISIONS].join(", ")}.`);
    }

    const normalized = {
        decision: normalizedDecision,
        priority: String(decision.priority || "").trim() || "normal",
        reason,
        nextStep: String(decision.nextStep || "").trim(),
    };

    if (normalizedDecision === "move_candidate") {
        const targetLevel = normalizeMoveTargetLevel(decision.targetLevel ?? decision.moveToLevel ?? decision.targetJlpt);
        if (!Number.isInteger(targetLevel)) {
            const context = key ? ` for ${key}` : "";
            throw new Error(`move_candidate triage decision${context} must include targetLevel N1-N5.`);
        }
        if (Number.isInteger(currentLevel) && targetLevel === currentLevel) {
            const context = key ? ` for ${key}` : "";
            throw new Error(`move_candidate triage decision${context} targets the current level N${currentLevel}; use keep_candidate instead.`);
        }
        normalized.targetLevel = targetLevel;
    }

    return normalized;
}

function normalizeTriageDecision(decision, { key = "", currentLevel = null } = {}) {
    const normalized = normalizeTriageDecisionCore(decision, { key, currentLevel });
    if (!normalized) {
        return null;
    }

    if (decision.placementDecisions || decision.modeDecisions) {
        const context = key ? ` for ${key}` : "";
        throw new Error(`Placement-specific word expansion triage overrides are not supported${context}; top-level move_candidate/defer/reject/keep decisions are authoritative.`);
    }

    return normalized;
}

function normalizeTriageDecisions(triageDecisions = {}, { currentLevel = null } = {}) {
    const normalized = {};
    for (const [key, decision] of Object.entries(triageDecisions || {})) {
        const normalizedDecision = normalizeTriageDecision(decision, { key, currentLevel });
        if (normalizedDecision) {
            normalized[key] = normalizedDecision;
        }
    }
    return normalized;
}

function formatEffectiveTriageDecision(decision, metadata = {}) {
    if (!decision) {
        return null;
    }
    return {
        ...decision,
        ...metadata,
    };
}

function resolveTriageDecisionForPlacementMode(decision, { placementMode = "kanji-anchor" } = {}) {
    if (!decision) {
        return null;
    }

    normalizePlacementMode(placementMode);

    return formatEffectiveTriageDecision(decision, {
        placementMode: "top-level",
        triageSource: "top-level",
    });
}

function buildWordInventoryExpansionCandidateReport({
    sourceRows = [],
    targetLevel = 5,
    jlptLevelContract = {},
    jlptWordLevelContract = {},
    kanjiScope = "at-or-below",
    limit = 50,
    requireSourceLevel = false,
    sourceLabel = "external",
    triageDecisions = {},
    placementMode = "kanji-anchor",
} = {}) {
    if (!Number.isInteger(targetLevel) || targetLevel < 1 || targetLevel > 5) {
        throw new Error("Target level must be an integer from 1 to 5.");
    }
    if (!Number.isInteger(limit) || limit < 1) {
        throw new Error("Candidate report limit must be a positive integer.");
    }

    const normalizedRows = sourceRows
        .flatMap((row) => normalizeCandidateSourceRows(row, { sourceLabel }))
        .filter(Boolean);
    const rowsByKey = new Map();
    let duplicateSourceRows = 0;

    normalizedRows.forEach((row, index) => {
        if (rowsByKey.has(row.key)) {
            duplicateSourceRows += 1;
            return;
        }
        rowsByKey.set(row.key, {
            ...row,
            firstSeenIndex: index,
        });
    });

    const sameWrittenContractIndex = buildSameWrittenContractIndex(jlptWordLevelContract);
    const normalizedPlacementMode = normalizePlacementMode(placementMode);
    const normalizedTriageDecisions = normalizeTriageDecisions(triageDecisions, { currentLevel: targetLevel });
    const reviewedRows = [...rowsByKey.values()]
        .map((row) => {
            const normalizedTriageDecision = normalizedTriageDecisions[row.key] || null;
            const triageDecision = resolveTriageDecisionForPlacementMode(normalizedTriageDecision, {
                placementMode: normalizedPlacementMode,
            });
            const classified = classifyCandidateDisposition(row, {
                targetLevel,
                kanjiScope,
                jlptLevelContract,
                jlptWordLevelContract,
                requireSourceLevel,
                placementMode: normalizedPlacementMode,
            });
            return {
                ...row,
                disposition: classified.disposition,
                reason: classified.reason,
                crossLevelRoutingTargetLevel: resolveCrossLevelRoutingTargetLevel(classified.scope, targetLevel),
                constituentKanji: classified.scope.constituentKanji,
                kanjiLevels: classified.scope.kanjiLevels,
                targetKanji: classified.scope.targetKanji.map((entry) => entry.kanji),
                harderKanji: classified.scope.harderKanji,
                easierKanji: classified.scope.easierKanji,
                outsideJlptKanji: classified.scope.outsideJlptKanji.map((entry) => entry.kanji),
                sameWrittenContractEntries: findSameWrittenContractEntries(row, sameWrittenContractIndex),
                triageDecision,
                sourceTriageDecision: null,
            };
        })
        .sort(compareCandidateRows);
    const candidateRows = reviewedRows.filter((row) => row.disposition === "review_candidate");
    const crossLevelRoutingRows = reviewedRows.filter((row) => (
        row.disposition === "no_target_kanji"
        && Number.isInteger(row.crossLevelRoutingTargetLevel)
    ));
    const sameWrittenCandidateRows = candidateRows
        .filter((row) => row.sameWrittenContractEntries.length > 0);
    const triagedCandidateRows = candidateRows
        .filter((row) => row.triageDecision);
    const triagedCrossLevelRoutingRows = crossLevelRoutingRows
        .filter((row) => row.triageDecision);

    return {
        levelLabel: `N${targetLevel}`,
        sourceLabel,
        summary: {
            sourceRows: sourceRows.length,
            normalizedRows: normalizedRows.length,
            uniqueRows: rowsByKey.size,
            duplicateSourceRows,
            kanjiScope,
            placementMode: normalizedPlacementMode,
            requireSourceLevel,
            reviewCandidateRows: candidateRows.length,
            shownCandidateRows: Math.min(candidateRows.length, limit),
            sameWrittenCandidateRows: sameWrittenCandidateRows.length,
            triagedCandidateRows: triagedCandidateRows.length,
            untriagedCandidateRows: candidateRows.length - triagedCandidateRows.length,
            triageDecisions: summarizeCandidateTriage(candidateRows),
            crossLevelRoutingRows: crossLevelRoutingRows.length,
            shownCrossLevelRoutingRows: Math.min(crossLevelRoutingRows.length, limit),
            triagedCrossLevelRoutingRows: triagedCrossLevelRoutingRows.length,
            untriagedCrossLevelRoutingRows: crossLevelRoutingRows.length - triagedCrossLevelRoutingRows.length,
            crossLevelRoutingTriageDecisions: summarizeCandidateTriage(crossLevelRoutingRows),
            dispositions: summarizeDispositions(reviewedRows),
        },
        candidates: candidateRows.slice(0, limit),
        crossLevelRoutingCandidates: crossLevelRoutingRows.slice(0, limit),
        allRows: reviewedRows,
    };
}

function formatKanjiLevels(row) {
    if (!row.kanjiLevels || row.kanjiLevels.length === 0) {
        return "none";
    }
    return row.kanjiLevels
        .map((entry) => `${entry.kanji}:${Number.isInteger(entry.level) ? `N${entry.level}` : "outside-JLPT"}`)
        .join(", ");
}

function formatSameWrittenContractEntries(entries = []) {
    return entries.map((entry) => {
        const level = Number.isInteger(entry.jlpt) ? `N${entry.jlpt}` : "unknown level";
        if (entry.type === "excluded") {
            return `${entry.reading} (${level}, excluded${entry.exclusionReason ? `: ${entry.exclusionReason}` : ""})`;
        }
        return `${entry.reading} (${level})`;
    }).join(", ");
}

function appendTriageLines(lines, row) {
    if (row.triageDecision) {
        lines.push(`   triage: ${row.triageDecision.decision} [${row.triageDecision.priority}]`);
        if (Number.isInteger(row.triageDecision.targetLevel)) {
            lines.push(`   triage target level: N${row.triageDecision.targetLevel}`);
        }
        lines.push(`   triage reason: ${row.triageDecision.reason}`);
        if (row.triageDecision.nextStep) {
            lines.push(`   triage next step: ${row.triageDecision.nextStep}`);
        }
    } else {
        lines.push("   triage: untriaged");
    }
}

function formatWordInventoryExpansionCandidateReport(report) {
    const lines = [];
    lines.push(`Japanese Kanji Builder Word Inventory Expansion Candidates (${report.levelLabel})`);
    lines.push("");
    lines.push("Read-only report: this does not promote words, change contracts, or affect readiness.");
    lines.push("Use after the current reading-coverage pass; every candidate still needs source/commonness/sentence/platinum review.");
    lines.push("");
    lines.push(`Source: ${report.sourceLabel}`);
    lines.push(`Kanji scope: ${report.summary.kanjiScope}`);
    lines.push(`Placement mode: ${report.summary.placementMode || "kanji-anchor"}`);
    lines.push(`Source rows: ${report.summary.sourceRows}`);
    lines.push(`Normalized written-reading rows: ${report.summary.normalizedRows}`);
    lines.push(`Unique written-reading rows: ${report.summary.uniqueRows}`);
    lines.push(`Duplicate source rows skipped: ${report.summary.duplicateSourceRows}`);
    lines.push(`Review candidates: ${report.summary.reviewCandidateRows}`);
    lines.push(`Same-written candidate warnings: ${report.summary.sameWrittenCandidateRows}`);
    lines.push(`Triaged review candidates: ${report.summary.triagedCandidateRows}/${report.summary.reviewCandidateRows}`);
    lines.push(`Cross-level routing rows: ${report.summary.crossLevelRoutingRows || 0}`);
    lines.push(`Triaged cross-level routing rows: ${report.summary.triagedCrossLevelRoutingRows || 0}/${report.summary.crossLevelRoutingRows || 0}`);
    lines.push("");
    lines.push("Disposition counts:");
    for (const [disposition, count] of Object.entries(report.summary.dispositions).sort()) {
        lines.push(`- ${disposition}: ${count}`);
    }
    lines.push("");
    lines.push("Triage decision counts:");
    for (const [decision, count] of Object.entries(report.summary.triageDecisions).sort()) {
        lines.push(`- ${decision}: ${count}`);
    }
    lines.push("");

    if ((report.summary.crossLevelRoutingRows || 0) > 0) {
        lines.push("Cross-level routing decision counts:");
        for (const [decision, count] of Object.entries(report.summary.crossLevelRoutingTriageDecisions || {}).sort()) {
            lines.push(`- ${decision}: ${count}`);
        }
        lines.push("");
    }

    if (report.candidates.length === 0 && (report.crossLevelRoutingCandidates || []).length === 0) {
        lines.push("No review candidates or cross-level routing rows matched the requested source and kanji scope.");
        return lines.join("\n") + "\n";
    }

    if (report.candidates.length > 0) {
        lines.push(`Candidates shown (${report.candidates.length}):`);
        report.candidates.forEach((row, index) => {
            lines.push(`${index + 1}. ${row.written} (${row.reading})`);
            lines.push(`   meaning: ${row.meaning || "source did not provide one"}`);
            lines.push(`   kanji: ${formatKanjiLevels(row)}`);
            lines.push(`   source: ${row.source}${row.sourceLevel ? `; source level N${row.sourceLevel}` : ""}`);
            lines.push(`   review: ${row.reason}`);
            if (row.sameWrittenContractEntries.length > 0) {
                lines.push(`   same-written warning: already tracked with reading(s) ${formatSameWrittenContractEntries(row.sameWrittenContractEntries)}`);
            }
            appendTriageLines(lines, row);
            if (row.notes) {
                lines.push(`   notes: ${row.notes}`);
            }
        });
        lines.push("");
    } else {
        lines.push("No review candidates matched the requested source and kanji scope.");
        lines.push("");
    }

    if ((report.crossLevelRoutingCandidates || []).length > 0) {
        lines.push(`Cross-level routing rows shown (${report.crossLevelRoutingCandidates.length}):`);
        lines.push("These rows are not current-level promotion candidates; move them only through explicit target-level contract and starter-data review.");
        report.crossLevelRoutingCandidates.forEach((row, index) => {
            lines.push(`${index + 1}. ${row.written} (${row.reading})`);
            lines.push(`   meaning: ${row.meaning || "source did not provide one"}`);
            lines.push(`   kanji: ${formatKanjiLevels(row)}`);
            lines.push(`   source: ${row.source}${row.sourceLevel ? `; source level N${row.sourceLevel}` : ""}`);
            lines.push(`   current-level disposition: ${row.reason}`);
            lines.push(`   suggested anchor review level: N${row.crossLevelRoutingTargetLevel}`);
            appendTriageLines(lines, row);
            if (row.notes) {
                lines.push(`   notes: ${row.notes}`);
            }
        });
    }

    return lines.join("\n") + "\n";
}

module.exports = {
    buildWordInventoryExpansionCandidateReport,
    classifyCandidateDisposition,
    classifyKanjiScope,
    formatWordInventoryExpansionCandidateReport,
    formatSameWrittenContractEntries,
    normalizeMoveTargetLevel,
    normalizeTriageDecision,
    normalizeTriageDecisions,
    normalizeCandidateSourceRow,
    normalizeCandidateSourceRows,
    normalizePlacementMode,
    resolveTriageDecisionForPlacementMode,
    parseCandidateSourceText,
    parseDelimitedLine,
    parseSourceLevel,
    resolveCrossLevelRoutingTargetLevel,
    splitReadingVariants,
};
