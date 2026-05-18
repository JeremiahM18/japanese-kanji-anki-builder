const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const { buildWordStudyEntryKey } = require("../datasets/wordStudyData");
const { extractConstituentKanji, isLikelyPhraseCard } = require("./wordExportService");
const { auditWordLevelAnchors } = require("./wordLevelAnchorAuditService");
const {
    classifyKanjiScope,
    normalizeCandidateSourceRows,
    normalizeTriageDecision,
    parseCandidateSourceText,
} = require("./wordInventoryExpansionCandidateService");

function sourceAllows(source = {}, use) {
    return Array.isArray(source.allowedUse) && source.allowedUse.includes(use);
}

function buildSourceFileIntegrity({ sourceBuffer, sourceRows } = {}) {
    const buffer = Buffer.isBuffer(sourceBuffer) ? sourceBuffer : Buffer.from(String(sourceBuffer || ""), "utf8");
    return {
        sha256: crypto.createHash("sha256").update(buffer).digest("hex"),
        byteSize: buffer.length,
        rowCount: Array.isArray(sourceRows) ? sourceRows.length : null,
    };
}

function validateSourceIntegrity(source = {}, integrity = {}) {
    const blockers = [];
    const local = source.local || {};
    if (local.sha256 && integrity.sha256 !== String(local.sha256).toLowerCase()) {
        blockers.push(`sha256 mismatch: expected ${local.sha256}, got ${integrity.sha256 || "missing"}`);
    }
    if (Number.isInteger(local.byteSize) && integrity.byteSize !== local.byteSize) {
        blockers.push(`byte size mismatch: expected ${local.byteSize}, got ${integrity.byteSize}`);
    }
    if (Number.isInteger(local.rowCount) && integrity.rowCount !== local.rowCount) {
        blockers.push(`row count mismatch: expected ${local.rowCount}, got ${integrity.rowCount}`);
    }
    return blockers;
}

function normalizeLevels(levels = [5, 4]) {
    const normalized = [...new Set(
        (Array.isArray(levels) ? levels : [levels])
            .map((level) => Number(level))
            .filter((level) => Number.isInteger(level) && level >= 1 && level <= 5)
    )];
    if (normalized.length === 0) {
        throw new Error("At least one word candidate agreement level is required.");
    }
    return normalized;
}

function createSameWrittenContractIndex(jlptWordLevelContract = {}) {
    const index = new Map();

    function addEntries(entries = {}, status) {
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
                status,
            });
        }
    }

    addEntries(jlptWordLevelContract.wordLevels, "governed");
    addEntries(jlptWordLevelContract.excludedWordLevels, "excluded");
    return index;
}

function getContractStatus(key, jlptWordLevelContract = {}) {
    const wordEntry = jlptWordLevelContract.wordLevels?.[key];
    if (wordEntry) {
        return {
            status: "already_governed",
            level: wordEntry.jlpt,
            label: `already governed in N${wordEntry.jlpt}`,
        };
    }
    const excludedEntry = jlptWordLevelContract.excludedWordLevels?.[key];
    if (excludedEntry) {
        return {
            status: "already_excluded",
            level: excludedEntry.jlpt,
            label: `already excluded in N${excludedEntry.jlpt}`,
        };
    }
    return {
        status: "not_governed",
        level: null,
        label: "not governed",
    };
}

function getSameWrittenConflicts(row, sameWrittenIndex) {
    return (sameWrittenIndex.get(row.written) || [])
        .filter((entry) => entry.key !== row.key)
        .sort((a, b) => (
            a.status.localeCompare(b.status)
            || a.reading.localeCompare(b.reading, "ja")
        ));
}

function rowMatchesLevelPolicy({ row, source, targetLevel, scope }) {
    const policy = source.candidatePolicy || {};
    if (Array.isArray(policy.levels) && policy.levels.length > 0 && !policy.levels.includes(targetLevel)) {
        return false;
    }
    if (policy.requireSourceLevel && row.sourceLevel !== targetLevel) {
        return false;
    }
    if (scope.constituentKanji.length === 0 || scope.targetKanji.length === 0) {
        return false;
    }

    const kanjiScope = policy.kanjiScope || "known-jlpt";
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
    throw new Error(`Unsupported candidatePolicy.kanjiScope: ${kanjiScope}`);
}

function hasTemplateMarker(row = {}) {
    return /[～~・]/u.test(String(row.written || "")) || /[～~・]/u.test(String(row.reading || ""));
}

function buildIdentityReview(row = {}) {
    const risks = [];
    if (extractConstituentKanji(row.written).length === 0) {
        risks.push("kana-only");
    }
    if (hasTemplateMarker(row)) {
        risks.push("template-marker");
    }
    if (isLikelyPhraseCard(row)) {
        risks.push("phrase-shaped");
    }
    return {
        clean: risks.length === 0,
        risks,
    };
}

function buildLearnerFitRisks({ row, scope, sameWrittenConflicts }) {
    const risks = [];
    if (scope.harderKanji.length > 0) {
        risks.push(`harder support kanji ${scope.harderKanji.map((entry) => `${entry.kanji}=N${entry.level}`).join(", ")}`);
    }
    if (scope.outsideJlptKanji.length > 0) {
        risks.push(`outside-JLPT kanji ${scope.outsideJlptKanji.map((entry) => entry.kanji).join(", ")}`);
    }
    if (hasTemplateMarker(row)) {
        risks.push("template or suru-marker identity");
    }
    if (isLikelyPhraseCard(row)) {
        risks.push("phrase/expression policy needed");
    }
    if (sameWrittenConflicts.length > 0) {
        risks.push("same-written alternate already tracked");
    }
    return risks;
}

function summarizeCounts(rows, field) {
    return rows.reduce((summary, row) => {
        const value = row[field] || "unknown";
        summary[value] = (summary[value] || 0) + 1;
        return summary;
    }, {});
}

function buildSourceSummaries({ manifest, readFile = fs.readFileSync } = {}) {
    const sourceRowsById = {};
    const sourceSummaries = [];
    const sourceBlockers = [];

    for (const [sourceId, source] of Object.entries(manifest.sources || {})) {
        const summary = {
            sourceId,
            name: source.name,
            tier: source.tier,
            status: source.status,
            sourceType: source.sourceType,
            allowedUse: source.allowedUse || [],
            localPath: source.local?.path || "",
            rowCount: null,
            activeLocalEvidence: source.status === "active"
                && (
                    sourceAllows(source, "candidate-discovery")
                    || sourceAllows(source, "dictionary-verification")
                    || sourceAllows(source, "frequency-sanity")
                    || sourceAllows(source, "usefulness-support")
                ),
            candidateDiscoveryActive: source.status === "active" && sourceAllows(source, "candidate-discovery"),
            blockers: [],
        };

        if (!summary.activeLocalEvidence) {
            sourceSummaries.push(summary);
            continue;
        }

        const sourcePath = path.resolve(process.cwd(), source.local.path);
        if (!fs.existsSync(sourcePath)) {
            summary.blockers.push(`missing local source file: ${source.local.path}`);
            sourceBlockers.push(`${sourceId}: missing local source file ${source.local.path}`);
            sourceSummaries.push(summary);
            continue;
        }

        const sourceBuffer = readFile(sourcePath);
        const sourceText = Buffer.isBuffer(sourceBuffer) ? sourceBuffer.toString("utf8") : String(sourceBuffer || "");
        const parsedRows = parseCandidateSourceText(sourceText, {
            format: source.local.format || "auto",
        });
        const integrity = buildSourceFileIntegrity({
            sourceBuffer: Buffer.isBuffer(sourceBuffer) ? sourceBuffer : Buffer.from(sourceText, "utf8"),
            sourceRows: parsedRows,
        });
        const blockers = validateSourceIntegrity(source, integrity);

        summary.rowCount = parsedRows.length;
        summary.integrity = integrity;
        summary.blockers.push(...blockers);
        if (blockers.length > 0) {
            sourceBlockers.push(...blockers.map((blocker) => `${sourceId}: ${blocker}`));
            sourceSummaries.push(summary);
            continue;
        }

        sourceRowsById[sourceId] = parsedRows;
        sourceSummaries.push(summary);
    }

    return {
        sourceBlockers,
        sourceRowsById,
        sourceSummaries,
    };
}

function addSourceRowsToLevels({
    levels,
    manifest,
    sourceRowsById,
    jlptLevelContract,
    jlptWordLevelContract,
    starterEntries,
    wordPitchAccentData,
    triageDecisionsByLevelSource = {},
}) {
    const sameWrittenIndex = createSameWrittenContractIndex(jlptWordLevelContract);
    const rowsByLevel = new Map(levels.map((level) => [level, new Map()]));
    const normalizedRowsBySourceId = {};

    for (const [sourceId, sourceRows] of Object.entries(sourceRowsById)) {
        const source = manifest.sources[sourceId];
        if (!source) {
            continue;
        }
        normalizedRowsBySourceId[sourceId] = sourceRows
            .flatMap((row) => normalizeCandidateSourceRows(row, { sourceLabel: sourceId }))
            .map((row) => ({
                ...row,
                source: sourceId,
            }));
    }

    for (const [sourceId, normalizedRows] of Object.entries(normalizedRowsBySourceId)) {
        const source = manifest.sources[sourceId];
        if (!sourceAllows(source, "candidate-discovery")) {
            continue;
        }
        for (const row of normalizedRows) {
            for (const targetLevel of levels) {
                const scope = classifyKanjiScope(row, { targetLevel, jlptLevelContract });
                if (!rowMatchesLevelPolicy({ row, source, targetLevel, scope })) {
                    continue;
                }

                const key = buildWordStudyEntryKey(row);
                const levelRows = rowsByLevel.get(targetLevel);
                if (!levelRows.has(key)) {
                    const sameWrittenConflicts = getSameWrittenConflicts(row, sameWrittenIndex);
                    const identity = buildIdentityReview(row);
                    const contractStatus = getContractStatus(key, jlptWordLevelContract);
                    const learnerFitRisks = buildLearnerFitRisks({ row, scope, sameWrittenConflicts });
                    levelRows.set(key, {
                        key,
                        written: row.written,
                        reading: row.reading,
                        meaning: row.meaning || "",
                        targetLevel,
                        kanjiLevels: scope.kanjiLevels,
                        targetKanji: scope.targetKanji.map((entry) => entry.kanji),
                        sourceAppearances: [],
                        contractStatus,
                        cleanIdentity: identity.clean,
                        identityRisks: identity.risks,
                        sameWrittenConflicts,
                        learnerFitRisks,
                        triageDecisions: [],
                        dictionaryVerified: false,
                        frequencySupported: false,
                        sentenceSupported: Boolean(starterEntries?.[key]?.exampleSentence),
                        pitchSupported: Boolean(wordPitchAccentData?.entries?.[key]),
                    });
                }

                const candidate = levelRows.get(key);
                addSourceAppearance(candidate, sourceId, source, row, {
                    targetLevel,
                    triageDecisionsByLevelSource,
                });
            }
        }
    }

    for (const [sourceId, normalizedRows] of Object.entries(normalizedRowsBySourceId)) {
        const source = manifest.sources[sourceId];
        if (sourceAllows(source, "candidate-discovery")) {
            continue;
        }
        for (const row of normalizedRows) {
            for (const targetLevel of levels) {
                const candidate = rowsByLevel.get(targetLevel)?.get(row.key);
                if (candidate) {
                    addSourceAppearance(candidate, sourceId, source, row, {
                        targetLevel,
                        triageDecisionsByLevelSource,
                    });
                }
            }
        }
    }

    return Object.fromEntries([...rowsByLevel.entries()].map(([level, rows]) => [
        level,
        [...rows.values()].map((row) => {
            const sourceIds = [...new Set(row.sourceAppearances.map((appearance) => appearance.sourceId))].sort();
            const triageStatus = resolveTriageStatus(row);
            const candidateStatus = resolveCandidateStatus(row, triageStatus);
            const nextRequiredEvidence = buildNextRequiredEvidence(row);
            return {
                ...row,
                sourceIds,
                sourceAppearanceCount: sourceIds.length,
                triageStatus,
                candidateStatus,
                nextRequiredEvidence,
                reviewReadiness: buildReviewReadiness(row, nextRequiredEvidence),
            };
        }).sort(compareAgreementRows),
    ]));
}

function getTriageDecision({ triageDecisionsByLevelSource = {}, targetLevel, sourceId, key }) {
    const decision = triageDecisionsByLevelSource?.[`N${targetLevel}`]?.[sourceId]?.[key] || null;
    return normalizeTriageDecision(decision, { key: `N${targetLevel}/${sourceId}/${key}` });
}

function addSourceAppearance(candidate, sourceId, source, row, {
    targetLevel,
    triageDecisionsByLevelSource = {},
} = {}) {
    if (!candidate.sourceAppearances.some((appearance) => appearance.sourceId === sourceId)) {
        candidate.sourceAppearances.push({
            sourceId,
            sourceType: source.sourceType,
            tier: source.tier,
            allowedUse: source.allowedUse || [],
            sourceLevel: row.sourceLevel,
            frequencyRank: row.frequencyRank,
        });
    }
    const triageDecision = getTriageDecision({
        triageDecisionsByLevelSource,
        targetLevel,
        sourceId,
        key: row.key,
    });
    if (triageDecision && !candidate.triageDecisions.some((decision) => (
        decision.sourceId === sourceId && decision.decision === triageDecision.decision
    ))) {
        candidate.triageDecisions.push({
            sourceId,
            ...triageDecision,
        });
    }
    if (sourceAllows(source, "dictionary-verification")) {
        candidate.dictionaryVerified = true;
    }
    if (
        Number.isInteger(row.frequencyRank)
        && (sourceAllows(source, "frequency-sanity") || sourceAllows(source, "usefulness-support"))
    ) {
        candidate.frequencySupported = true;
    }
}

function resolveTriageStatus(row = {}) {
    const decisions = new Set((row.triageDecisions || []).map((decision) => decision.decision));
    if (decisions.has("keep_candidate")) {
        return "keep_candidate";
    }
    if (decisions.has("defer_candidate")) {
        return "defer_candidate";
    }
    if (decisions.has("reject_candidate")) {
        return "reject_candidate";
    }
    return "untriaged";
}

function resolveCandidateStatus(row = {}, triageStatus = "untriaged") {
    if (row.contractStatus?.status !== "not_governed") {
        return row.contractStatus.status;
    }
    if (triageStatus !== "untriaged") {
        return triageStatus;
    }
    if (!row.cleanIdentity) {
        return "identity_blocked";
    }
    return "untriaged_candidate";
}

function buildNextRequiredEvidence(row = {}) {
    const required = [];
    if (row.contractStatus?.status === "not_governed") {
        required.push("card approval review");
    }
    if (!row.dictionaryVerified) {
        required.push("dictionary written/reading/meaning verification");
    }
    if (!row.frequencySupported) {
        required.push("frequency/commonness support");
    }
    if (!row.sentenceSupported) {
        required.push("curated example sentence");
    }
    if (!row.pitchSupported) {
        required.push("pitch verification");
    }
    required.push("word audio");
    required.push("golden review");
    required.push("platinum review");
    return required;
}

function buildReviewReadiness(row = {}, nextRequiredEvidence = []) {
    const supportedEvidenceCount = [
        row.dictionaryVerified,
        row.frequencySupported,
        row.sentenceSupported,
        row.pitchSupported,
        row.cleanIdentity,
    ].filter(Boolean).length;

    return {
        supportedEvidenceCount,
        supportedEvidenceTotal: 5,
        nextEvidenceCount: nextRequiredEvidence.length,
        learnerFitRiskCount: (row.learnerFitRisks || []).length,
        sameWrittenConflictCount: (row.sameWrittenConflicts || []).length,
        identityRiskCount: (row.identityRisks || []).length,
    };
}

function compareAgreementRows(a, b) {
    const statusOrder = {
        keep_candidate: 0,
        untriaged_candidate: 1,
        defer_candidate: 2,
        identity_blocked: 3,
        reject_candidate: 4,
        already_governed: 5,
        already_excluded: 6,
    };
    return (
        (statusOrder[a.candidateStatus] ?? 9) - (statusOrder[b.candidateStatus] ?? 9)
        || a.reviewReadiness.nextEvidenceCount - b.reviewReadiness.nextEvidenceCount
        || b.reviewReadiness.supportedEvidenceCount - a.reviewReadiness.supportedEvidenceCount
        || a.reviewReadiness.learnerFitRiskCount - b.reviewReadiness.learnerFitRiskCount
        || a.reviewReadiness.sameWrittenConflictCount - b.reviewReadiness.sameWrittenConflictCount
        || a.reviewReadiness.identityRiskCount - b.reviewReadiness.identityRiskCount
        || b.sourceAppearanceCount - a.sourceAppearanceCount
        || a.written.localeCompare(b.written, "ja")
        || a.reading.localeCompare(b.reading, "ja")
    );
}

function summarizeLevelRows(rows = []) {
    return {
        targetRows: rows.length,
        candidateStatusCounts: summarizeCounts(rows, "candidateStatus"),
        dictionaryVerifiedRows: rows.filter((row) => row.dictionaryVerified).length,
        frequencySupportedRows: rows.filter((row) => row.frequencySupported).length,
        sentenceSupportedRows: rows.filter((row) => row.sentenceSupported).length,
        pitchSupportedRows: rows.filter((row) => row.pitchSupported).length,
        cleanIdentityRows: rows.filter((row) => row.cleanIdentity).length,
        sameWrittenConflictRows: rows.filter((row) => row.sameWrittenConflicts.length > 0).length,
    };
}

function buildWordCandidateAgreementReport({
    levels = [5, 4],
    manifest,
    jlptLevelContract = {},
    jlptWordLevelContract = {},
    starterEntries = {},
    wordPitchAccentData = {},
    triageDecisionsByLevelSource = {},
    limit = 40,
    readFile,
} = {}) {
    const normalizedLevels = normalizeLevels(levels);
    const sourceReport = buildSourceSummaries({ manifest, readFile });
    const rowsByLevel = addSourceRowsToLevels({
        levels: normalizedLevels,
        manifest,
        sourceRowsById: sourceReport.sourceRowsById,
        jlptLevelContract,
        jlptWordLevelContract,
        starterEntries,
        wordPitchAccentData,
        triageDecisionsByLevelSource,
    });
    const placementAudit = auditWordLevelAnchors({
        wordLevels: jlptWordLevelContract.wordLevels,
        wordStudyData: starterEntries,
        kanjiLevelData: jlptLevelContract,
    });

    return {
        manifestVersion: manifest.version,
        manifestCheckedAt: manifest.checkedAt,
        levels: normalizedLevels,
        placementAudit: {
            checked: placementAudit.checked,
            violationCount: placementAudit.violationCount,
            byPlacementStatus: placementAudit.byPlacementStatus,
        },
        sourceSummaries: sourceReport.sourceSummaries,
        sourceBlockers: sourceReport.sourceBlockers,
        levelReports: normalizedLevels.map((level) => {
            const rows = rowsByLevel[level] || [];
            return {
                level,
                levelLabel: `N${level}`,
                summary: summarizeLevelRows(rows),
                rows,
                shownRows: rows.slice(0, limit),
            };
        }),
    };
}

function formatKanjiLevels(kanjiLevels = []) {
    return kanjiLevels.length
        ? kanjiLevels.map((entry) => `${entry.kanji}:${Number.isInteger(entry.level) ? `N${entry.level}` : "outside-JLPT"}`).join(", ")
        : "none";
}

function formatBoolean(value) {
    return value ? "yes" : "no";
}

function formatWordCandidateAgreementReport(report = {}) {
    const lines = [
        "Japanese Kanji Builder Word Candidate Agreement",
        "",
        "Read-only report: this does not promote words, change contracts, generate decks, or approve cards.",
        "Candidate approval still requires dictionary/source verification, learner-fit review, examples, labels, audio, pitch, golden, platinum, and placement gates.",
        "",
        `Manifest: version ${report.manifestVersion}; checked ${report.manifestCheckedAt}`,
        `Placement gate: ${report.placementAudit.violationCount}/${report.placementAudit.checked} word-level placement violations`,
        "",
        "Source summary:",
        "| Source | Tier | Status | Type | Candidate rows | Candidate discovery |",
        "| --- | --- | --- | --- | --- | --- |",
    ];

    for (const source of report.sourceSummaries) {
        lines.push([
            `| ${source.sourceId}`,
            `T${source.tier}`,
            source.status,
            source.sourceType,
            Number.isInteger(source.rowCount) ? String(source.rowCount) : "-",
            source.candidateDiscoveryActive ? "yes" : "no",
        ].join(" | ") + " |");
    }

    if (report.sourceBlockers.length > 0) {
        lines.push("", "Source blockers:");
        for (const blocker of report.sourceBlockers) {
            lines.push(`- ${blocker}`);
        }
    }

    lines.push("", "Level candidate universe:");
    lines.push("| Level | Rows | Keep | Untriaged | Defer | Reject | Identity blocked | Already governed | Already excluded | Dictionary | Frequency | Sentence | Pitch |");
    lines.push("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
    for (const levelReport of report.levelReports) {
        const counts = levelReport.summary.candidateStatusCounts;
        lines.push([
            `| ${levelReport.levelLabel}`,
            levelReport.summary.targetRows,
            counts.keep_candidate || 0,
            counts.untriaged_candidate || 0,
            counts.defer_candidate || 0,
            counts.reject_candidate || 0,
            counts.identity_blocked || 0,
            counts.already_governed || 0,
            counts.already_excluded || 0,
            levelReport.summary.dictionaryVerifiedRows,
            levelReport.summary.frequencySupportedRows,
            levelReport.summary.sentenceSupportedRows,
            levelReport.summary.pitchSupportedRows,
        ].join(" | ") + " |");
    }

    for (const levelReport of report.levelReports) {
        lines.push("", `${levelReport.levelLabel} rows shown (${levelReport.shownRows.length}/${levelReport.summary.targetRows}):`);
        if (levelReport.shownRows.length === 0) {
            lines.push("- none");
            continue;
        }
        levelReport.shownRows.forEach((row, index) => {
            lines.push(`${index + 1}. ${row.written} (${row.reading})`);
            lines.push(`   status: ${row.candidateStatus}; contract: ${row.contractStatus.label}`);
            if (row.triageDecisions.length > 0) {
                for (const decision of row.triageDecisions) {
                    lines.push(`   triage (${decision.sourceId}): ${decision.decision} [${decision.priority || "normal"}] - ${decision.reason}`);
                    if (decision.nextStep) {
                        lines.push(`   triage next step: ${decision.nextStep}`);
                    }
                }
            }
            lines.push(`   sources: ${row.sourceIds.join(", ")}; kanji: ${formatKanjiLevels(row.kanjiLevels)}`);
            lines.push(`   support: dictionary ${formatBoolean(row.dictionaryVerified)}, frequency ${formatBoolean(row.frequencySupported)}, sentence ${formatBoolean(row.sentenceSupported)}, pitch ${formatBoolean(row.pitchSupported)}, clean identity ${formatBoolean(row.cleanIdentity)}`);
            lines.push(`   review readiness: evidence signals ${row.reviewReadiness.supportedEvidenceCount}/${row.reviewReadiness.supportedEvidenceTotal}; remaining evidence ${row.reviewReadiness.nextEvidenceCount}; learner-fit risks ${row.reviewReadiness.learnerFitRiskCount}`);
            if (row.sameWrittenConflicts.length > 0) {
                lines.push(`   same-written conflicts: ${row.sameWrittenConflicts.map((entry) => `${entry.reading} (${entry.status}${entry.jlpt ? ` N${entry.jlpt}` : ""})`).join(", ")}`);
            }
            if (row.learnerFitRisks.length > 0) {
                lines.push(`   learner-fit risks: ${row.learnerFitRisks.join("; ")}`);
            }
            lines.push(`   next evidence: ${row.nextRequiredEvidence.join("; ")}`);
        });
    }

    return `${lines.join("\n")}\n`;
}

module.exports = {
    buildReviewReadiness,
    buildSourceFileIntegrity,
    buildWordCandidateAgreementReport,
    formatWordCandidateAgreementReport,
    normalizeLevels,
    sourceAllows,
    validateSourceIntegrity,
};
