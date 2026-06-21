const fs = require("node:fs");
const path = require("node:path");

const {
    buildWordCandidateAgreementReport,
    buildSourceFileIntegrity,
    validateSourceIntegrity,
} = require("./wordCandidateAgreementService");
const {
    buildWordInventoryExpansionCandidateReport,
    parseCandidateSourceText,
} = require("./wordInventoryExpansionCandidateService");

const SOURCE_UNIVERSE_WARNING = "Configured-source selector only; not an official or global JLPT vocabulary universe.";

const SELECTOR_STATUSES = [
    "ready_for_editorial_review",
    "needs_triage",
    "blocked_identity",
    "blocked_missing_dictionary",
    "blocked_missing_commonness",
    "triaged_defer",
    "triaged_reject",
    "move_candidate",
    "already_governed",
    "already_excluded",
    "kana_only_out_of_scope",
];

const STATUS_ORDER = Object.fromEntries(SELECTOR_STATUSES.map((status, index) => [status, index]));

function sourceAllows(source = {}, use) {
    return Array.isArray(source.allowedUse) && source.allowedUse.includes(use);
}

function getCandidateDiscoverySourcesForLevel(manifest = {}, level) {
    return Object.entries(manifest.sources || {})
        .filter(([, source]) => (
            source.status === "active"
            && sourceAllows(source, "candidate-discovery")
            && source.local?.path
            && (
                !Array.isArray(source.candidatePolicy?.levels)
                || source.candidatePolicy.levels.length === 0
                || source.candidatePolicy.levels.includes(level)
            )
        ));
}

function buildSourceUniverse({ sourceId = "", source = {}, sourceSummary = null } = {}) {
    const integrity = sourceSummary?.integrity || source.local || {};
    return {
        sourceId,
        name: source.name || "",
        sourceType: source.sourceType || "",
        status: source.status || "",
        allowedUse: source.allowedUse || [],
        sourceUrl: source.origin?.url || "",
        localPath: source.local?.path || source.origin?.localPath || sourceSummary?.localPath || "",
        checkedAt: source.checkedAt || "",
        licenseStatus: source.licenseUse?.status || "",
        license: source.licenseUse?.license || "",
        rowCount: Number.isInteger(sourceSummary?.rowCount)
            ? sourceSummary.rowCount
            : (Number.isInteger(source.local?.rowCount) ? source.local.rowCount : null),
        sha256: integrity.sha256 || "",
        byteSize: Number.isInteger(integrity.byteSize) ? integrity.byteSize : null,
        configuredSourceOnly: true,
        warning: SOURCE_UNIVERSE_WARNING,
    };
}

function classifyCommonExpansionSelectorRow({ expansionRow = {}, agreementRow = null } = {}) {
    const triageDecision = expansionRow.triageDecision || agreementRow?.triageDecisions?.[0] || null;
    const triageStatus = triageDecision?.decision || agreementRow?.triageStatus || "untriaged";

    if (expansionRow.disposition === "already_governed" || agreementRow?.contractStatus?.status === "already_governed") {
        return "already_governed";
    }
    if (expansionRow.disposition === "already_excluded" || agreementRow?.contractStatus?.status === "already_excluded") {
        return "already_excluded";
    }
    if (expansionRow.disposition === "kana_only") {
        return "kana_only_out_of_scope";
    }
    if (triageStatus === "move_candidate") {
        return "move_candidate";
    }
    if (triageStatus === "defer_candidate") {
        return "triaged_defer";
    }
    if (triageStatus === "reject_candidate") {
        return "triaged_reject";
    }
    if (
        expansionRow.disposition === "source_template"
        || expansionRow.disposition === "likely_phrase"
        || expansionRow.disposition === "source_level_mismatch"
        || expansionRow.disposition === "kanji_scope_mismatch"
        || agreementRow?.cleanIdentity === false
        || (agreementRow?.identityRisks || []).length > 0
    ) {
        return "blocked_identity";
    }
    if (expansionRow.disposition === "no_target_kanji") {
        return "needs_triage";
    }
    if (!agreementRow?.dictionaryVerified) {
        return "blocked_missing_dictionary";
    }
    if (!agreementRow?.frequencySupported) {
        return "blocked_missing_commonness";
    }
    if (triageStatus === "keep_candidate") {
        return "ready_for_editorial_review";
    }
    return "needs_triage";
}

function summarizeSelectorRows(rows = []) {
    const selectorStatusCounts = Object.fromEntries(SELECTOR_STATUSES.map((status) => [status, 0]));
    for (const row of rows) {
        const status = SELECTOR_STATUSES.includes(row.selectorStatus) ? row.selectorStatus : "needs_triage";
        selectorStatusCounts[status] += 1;
    }
    return {
        selectedRows: rows.length,
        selectorStatusCounts,
        readyForEditorialReviewRows: selectorStatusCounts.ready_for_editorial_review,
        needsTriageRows: selectorStatusCounts.needs_triage,
        blockedRows: selectorStatusCounts.blocked_identity
            + selectorStatusCounts.blocked_missing_dictionary
            + selectorStatusCounts.blocked_missing_commonness,
        preTrustRows: rows.length,
    };
}

function compareSelectorRows(a, b) {
    return (
        (STATUS_ORDER[a.selectorStatus] ?? 99) - (STATUS_ORDER[b.selectorStatus] ?? 99)
        || a.reviewReadiness.nextEvidenceCount - b.reviewReadiness.nextEvidenceCount
        || b.reviewReadiness.supportedEvidenceCount - a.reviewReadiness.supportedEvidenceCount
        || a.written.localeCompare(b.written, "ja")
        || a.reading.localeCompare(b.reading, "ja")
    );
}

function buildAgreementRowIndex(agreementLevelReport = {}) {
    return new Map((agreementLevelReport.rows || []).map((row) => [row.key, row]));
}

function buildSelectorRow({ expansionRow = {}, agreementRow = null, sourceUniverse = {} } = {}) {
    const selectorStatus = classifyCommonExpansionSelectorRow({ expansionRow, agreementRow });
    const sourceAppearance = (agreementRow?.sourceAppearances || [])
        .find((appearance) => appearance.sourceId === sourceUniverse.sourceId) || null;
    return {
        key: expansionRow.key,
        written: expansionRow.written,
        reading: expansionRow.reading,
        meaning: expansionRow.meaning || agreementRow?.meaning || "",
        selectorStatus,
        sourceDisposition: expansionRow.disposition,
        sourceReason: expansionRow.reason,
        targetLevel: expansionRow.targetLevel || agreementRow?.targetLevel || null,
        sourceLevel: expansionRow.sourceLevel ?? sourceAppearance?.sourceLevel ?? null,
        sourceIds: agreementRow?.sourceIds || [sourceUniverse.sourceId].filter(Boolean),
        sourceAppearances: agreementRow?.sourceAppearances || [],
        dictionaryVerified: Boolean(agreementRow?.dictionaryVerified),
        frequencySupported: Boolean(agreementRow?.frequencySupported),
        sentenceSupported: Boolean(agreementRow?.sentenceSupported),
        pitchSupported: Boolean(agreementRow?.pitchSupported),
        cleanIdentity: Boolean(agreementRow?.cleanIdentity) || expansionRow.disposition === "review_candidate",
        identityRisks: agreementRow?.identityRisks || [],
        learnerFitRisks: agreementRow?.learnerFitRisks || [],
        sameWrittenConflicts: agreementRow?.sameWrittenConflicts || expansionRow.sameWrittenContractEntries || [],
        triageDecision: expansionRow.triageDecision || agreementRow?.triageDecisions?.[0] || null,
        contractStatus: agreementRow?.contractStatus || null,
        targetKanji: expansionRow.targetKanji || agreementRow?.targetKanji || [],
        constituentKanji: expansionRow.constituentKanji || [],
        kanjiLevels: expansionRow.kanjiLevels || agreementRow?.kanjiLevels || [],
        reviewReadiness: agreementRow?.reviewReadiness || {
            supportedEvidenceCount: 0,
            supportedEvidenceTotal: 5,
            nextEvidenceCount: 0,
            learnerFitRiskCount: 0,
            sameWrittenConflictCount: 0,
            identityRiskCount: 0,
        },
        nextRequiredEvidence: agreementRow?.nextRequiredEvidence || [],
    };
}

function loadSourceRows({ sourceId, source, readFile = fs.readFileSync } = {}) {
    const sourcePath = path.resolve(process.cwd(), source.local?.path || "");
    if (!source.local?.path || !fs.existsSync(sourcePath)) {
        return {
            sourceRows: [],
            integrity: null,
            blockers: [`${sourceId}: missing local source file ${source.local?.path || "(missing path)"}`],
        };
    }

    const sourceBuffer = readFile(sourcePath);
    const buffer = Buffer.isBuffer(sourceBuffer) ? sourceBuffer : Buffer.from(String(sourceBuffer || ""), "utf8");
    const sourceRows = parseCandidateSourceText(buffer.toString("utf8"), {
        format: source.local.format || "auto",
    });
    const integrity = buildSourceFileIntegrity({ sourceBuffer: buffer, sourceRows });
    const blockers = validateSourceIntegrity(source, integrity).map((blocker) => `${sourceId}: ${blocker}`);

    return {
        sourceRows,
        integrity,
        blockers,
    };
}

function buildLevelSelectorReport({
    level,
    manifest,
    sourceSummariesById,
    agreementLevelReport,
    jlptLevelContract,
    jlptWordLevelContract,
    triageDecisionsByLevelSource = {},
    limit = 40,
    readFile = fs.readFileSync,
} = {}) {
    const candidateSources = getCandidateDiscoverySourcesForLevel(manifest, level);
    const blockers = [];
    if (candidateSources.length !== 1) {
        blockers.push(`N${level}: expected exactly one active candidate-discovery source, found ${candidateSources.length}.`);
        return {
            level,
            levelLabel: `N${level}`,
            sourceUniverse: null,
            sourceCandidateSummary: null,
            summary: summarizeSelectorRows([]),
            rows: [],
            shownRows: [],
            blockers,
        };
    }

    const [sourceId, source] = candidateSources[0];
    const loadedSource = loadSourceRows({ sourceId, source, readFile });
    blockers.push(...loadedSource.blockers);
    const sourceUniverse = buildSourceUniverse({
        sourceId,
        source,
        sourceSummary: sourceSummariesById.get(sourceId) || null,
    });

    if (loadedSource.blockers.length > 0) {
        return {
            level,
            levelLabel: `N${level}`,
            sourceUniverse,
            sourceCandidateSummary: null,
            summary: summarizeSelectorRows([]),
            rows: [],
            shownRows: [],
            blockers,
        };
    }

    const candidatePolicy = source.candidatePolicy || {};
    const expansionReport = buildWordInventoryExpansionCandidateReport({
        sourceRows: loadedSource.sourceRows,
        targetLevel: level,
        kanjiScope: candidatePolicy.kanjiScope || "known-jlpt",
        requireSourceLevel: Boolean(candidatePolicy.requireSourceLevel),
        sourceLabel: sourceId,
        limit: Number.MAX_SAFE_INTEGER,
        triageDecisions: triageDecisionsByLevelSource?.[`N${level}`]?.[sourceId] || {},
        jlptLevelContract,
        jlptWordLevelContract,
    });

    const agreementRowsByKey = buildAgreementRowIndex(agreementLevelReport);
    const rows = expansionReport.allRows
        .map((expansionRow) => buildSelectorRow({
            expansionRow,
            agreementRow: agreementRowsByKey.get(expansionRow.key) || null,
            sourceUniverse,
        }))
        .sort(compareSelectorRows);
    const summary = {
        ...summarizeSelectorRows(rows),
        sourceRows: expansionReport.summary.sourceRows,
        normalizedRows: expansionReport.summary.normalizedRows,
        uniqueRows: expansionReport.summary.uniqueRows,
        duplicateSourceRows: expansionReport.summary.duplicateSourceRows,
        sourceDispositionCounts: expansionReport.summary.dispositions,
    };

    return {
        level,
        levelLabel: `N${level}`,
        sourceUniverse: {
            ...sourceUniverse,
            rowCount: loadedSource.integrity?.rowCount ?? sourceUniverse.rowCount,
            sha256: loadedSource.integrity?.sha256 || sourceUniverse.sha256,
            byteSize: loadedSource.integrity?.byteSize ?? sourceUniverse.byteSize,
        },
        sourceCandidateSummary: expansionReport.summary,
        summary,
        rows,
        shownRows: rows.slice(0, limit),
        blockers,
    };
}

function buildWordCommonExpansionSelectorReport({
    levels = [5, 4, 3, 2, 1],
    manifest,
    jlptLevelContract = {},
    jlptWordLevelContract = {},
    starterEntries = {},
    wordPitchAccentData = {},
    triageDecisionsByLevelSource = {},
    limit = 40,
    readFile = fs.readFileSync,
} = {}) {
    const agreementReport = buildWordCandidateAgreementReport({
        levels,
        manifest,
        jlptLevelContract,
        jlptWordLevelContract,
        starterEntries,
        wordPitchAccentData,
        triageDecisionsByLevelSource,
        limit: Number.MAX_SAFE_INTEGER,
        readFile,
    });
    const sourceSummariesById = new Map(agreementReport.sourceSummaries.map((summary) => [summary.sourceId, summary]));
    const agreementReportsByLevel = new Map(agreementReport.levelReports.map((levelReport) => [levelReport.level, levelReport]));
    const levelReports = levels.map((level) => buildLevelSelectorReport({
        level,
        manifest,
        sourceSummariesById,
        agreementLevelReport: agreementReportsByLevel.get(level) || null,
        jlptLevelContract,
        jlptWordLevelContract,
        triageDecisionsByLevelSource,
        limit,
        readFile,
    }));
    const blockers = [
        ...agreementReport.sourceBlockers,
        ...levelReports.flatMap((levelReport) => levelReport.blockers || []),
    ];

    return {
        reportName: "word-common-expansion-selector",
        manifestVersion: agreementReport.manifestVersion,
        manifestCheckedAt: agreementReport.manifestCheckedAt,
        configuredSourceOnly: true,
        warning: SOURCE_UNIVERSE_WARNING,
        levels,
        placementAudit: agreementReport.placementAudit,
        sourceSummaries: agreementReport.sourceSummaries,
        sourceBlockers: agreementReport.sourceBlockers,
        blockers,
        summary: {
            levels: levelReports.length,
            rows: levelReports.reduce((total, levelReport) => total + levelReport.summary.selectedRows, 0),
            readyForEditorialReviewRows: levelReports.reduce((total, levelReport) => total + levelReport.summary.readyForEditorialReviewRows, 0),
            needsTriageRows: levelReports.reduce((total, levelReport) => total + levelReport.summary.needsTriageRows, 0),
            blockedRows: levelReports.reduce((total, levelReport) => total + levelReport.summary.blockedRows, 0),
            blockerCount: blockers.length,
        },
        levelReports,
    };
}

function formatBoolean(value) {
    return value ? "yes" : "no";
}

function formatSourceUniverse(sourceUniverse = {}) {
    if (!sourceUniverse) {
        return "none";
    }
    return [
        sourceUniverse.sourceId,
        sourceUniverse.localPath,
        `rows ${sourceUniverse.rowCount ?? "-"}`,
        sourceUniverse.sha256 ? `sha ${sourceUniverse.sha256.slice(0, 12)}` : "sha -",
        `license ${sourceUniverse.licenseStatus || "-"}`,
    ].join("; ");
}

function formatWordCommonExpansionSelectorReport(report = {}) {
    const lines = [
        "Japanese Kanji Builder Governed Common-Word Silver Selector",
        "",
        "Read-only report: this does not add Silver rows, change contracts, move denominators, approve cards, or certify review lanes.",
        `Source scope: ${report.warning}`,
        "",
        `Manifest: version ${report.manifestVersion}; checked ${report.manifestCheckedAt}`,
        `Placement gate: ${report.placementAudit?.violationCount || 0}/${report.placementAudit?.checked || 0} word-level placement violations`,
        "",
        "Level source universe:",
        "| Level | Configured source |",
        "| --- | --- |",
    ];

    for (const levelReport of report.levelReports || []) {
        lines.push(`| ${levelReport.levelLabel} | ${formatSourceUniverse(levelReport.sourceUniverse)} |`);
    }

    lines.push(
        "",
        "Selector summary:",
        "| Level | Rows | Ready | Needs triage | Move | Defer | Reject | Blocked identity | Missing dictionary | Missing commonness | Already governed | Already excluded | Kana-only out of scope |",
        "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |"
    );

    for (const levelReport of report.levelReports || []) {
        const counts = levelReport.summary.selectorStatusCounts || {};
        lines.push([
            `| ${levelReport.levelLabel}`,
            levelReport.summary.selectedRows,
            counts.ready_for_editorial_review || 0,
            counts.needs_triage || 0,
            counts.move_candidate || 0,
            counts.triaged_defer || 0,
            counts.triaged_reject || 0,
            counts.blocked_identity || 0,
            counts.blocked_missing_dictionary || 0,
            counts.blocked_missing_commonness || 0,
            counts.already_governed || 0,
            counts.already_excluded || 0,
            counts.kana_only_out_of_scope || 0,
        ].join(" | ") + " |");
    }

    const blockers = report.blockers || [];
    if (blockers.length > 0) {
        lines.push("", "Selector blockers:");
        for (const blocker of blockers) {
            lines.push(`- ${blocker}`);
        }
    }

    for (const levelReport of report.levelReports || []) {
        lines.push("", `${levelReport.levelLabel} rows shown (${levelReport.shownRows.length}/${levelReport.summary.selectedRows}):`);
        if (levelReport.shownRows.length === 0) {
            lines.push("- none");
            continue;
        }
        levelReport.shownRows.forEach((row, index) => {
            lines.push(`${index + 1}. ${row.written} (${row.reading})`);
            lines.push(`   status: ${row.selectorStatus}; source disposition: ${row.sourceDisposition}`);
            lines.push(`   support: dictionary ${formatBoolean(row.dictionaryVerified)}, commonness ${formatBoolean(row.frequencySupported)}, sentence ${formatBoolean(row.sentenceSupported)}, pitch ${formatBoolean(row.pitchSupported)}, clean identity ${formatBoolean(row.cleanIdentity)}`);
            if (row.triageDecision) {
                lines.push(`   triage: ${row.triageDecision.decision} [${row.triageDecision.priority || "normal"}] - ${row.triageDecision.reason}`);
                if (Number.isInteger(row.triageDecision.targetLevel)) {
                    lines.push(`   triage target level: N${row.triageDecision.targetLevel}`);
                }
            }
            if (row.sameWrittenConflicts.length > 0) {
                lines.push(`   same-written conflicts: ${row.sameWrittenConflicts.map((entry) => `${entry.reading} (${entry.status || entry.type}${entry.jlpt ? ` N${entry.jlpt}` : ""})`).join(", ")}`);
            }
            if (row.learnerFitRisks.length > 0) {
                lines.push(`   learner-fit risks: ${row.learnerFitRisks.join("; ")}`);
            }
            if (row.nextRequiredEvidence.length > 0) {
                lines.push(`   next evidence: ${row.nextRequiredEvidence.join("; ")}`);
            }
        });
    }

    return `${lines.join("\n")}\n`;
}

module.exports = {
    SELECTOR_STATUSES,
    SOURCE_UNIVERSE_WARNING,
    buildLevelSelectorReport,
    buildSourceUniverse,
    buildWordCommonExpansionSelectorReport,
    classifyCommonExpansionSelectorRow,
    formatWordCommonExpansionSelectorReport,
    getCandidateDiscoverySourcesForLevel,
    summarizeSelectorRows,
};
