const fs = require("node:fs");
const path = require("node:path");

const {
    JLPT_LEVELS,
    buildContractSetsByLevel,
    parseKanjiTsv,
} = require("./kanjiDeckGeneratedSurfaceAuditService");
const { buildKanjiDeckPartitionPlan, CANDIDATE_SCOPES } = require("./kanjiDeckPartitionPlanService");
const {
    buildAdditionalKanjiExportPath,
    selectPhysicalAdditionalEntries,
} = require("./additionalKanjiDeckService");
const {
    buildKanjiReviewStandardSummary,
    buildKanjiVerificationLimitationSummary,
    isCurrentStandardPlatinumEntry,
} = require("./platinumKanjiReviewService");
const {
    buildKanjiSapphireReviewStandardSummary,
    buildKanjiSapphireVerificationLimitationSummary,
    isCurrentStandardSapphireEntry,
} = require("./sapphireKanjiReviewService");

function toSortedArray(values = []) {
    return [...values].sort((a, b) => a.localeCompare(b, "ja"));
}

function readJson(filePath, { readFile = fs.readFileSync } = {}) {
    return JSON.parse(readFile(filePath, "utf8"));
}

function buildKanjiSetFromReviewSet(reviewSet = []) {
    return new Set(
        (Array.isArray(reviewSet) ? reviewSet : [])
            .map((entry) => String(entry?.kanji || "").trim())
            .filter(Boolean)
    );
}

function buildActivePlatinumSet(reviewSet = []) {
    return new Set(
        (Array.isArray(reviewSet) ? reviewSet : [])
            .filter(isCurrentStandardPlatinumEntry)
            .map((entry) => String(entry?.kanji || "").trim())
            .filter(Boolean)
    );
}

function buildActiveSapphireSet(reviewSet = []) {
    return new Set(
        (Array.isArray(reviewSet) ? reviewSet : [])
            .filter(isCurrentStandardSapphireEntry)
            .map((entry) => String(entry?.kanji || "").trim())
            .filter(Boolean)
    );
}

function readGeneratedKanjiSet(exportPath, { exists = fs.existsSync, readFile = fs.readFileSync } = {}) {
    if (!exists(exportPath)) {
        return {
            exists: false,
            rows: 0,
            unique: 0,
            kanji: new Set(),
        };
    }

    const parsed = parseKanjiTsv(readFile(exportPath, "utf8"));
    return {
        exists: true,
        rows: parsed.kanji.length,
        unique: new Set(parsed.kanji).size,
        kanji: new Set(parsed.kanji),
    };
}

function difference(left, right) {
    return toSortedArray([...left].filter((value) => !right.has(value)));
}

function buildReviewStatusRow({
    deckId,
    deckType,
    level,
    exportPath,
    generated,
    goldenSet,
    platinumSet,
    structuralLane = "Sapphire",
    reviewStandardSummary = {},
    verificationLimitationSummary = {},
    plannedCount = null,
} = {}) {
    const missingGolden = difference(generated.kanji, goldenSet);
    const missingStructural = difference(generated.kanji, platinumSet);
    const extraGolden = difference(goldenSet, generated.kanji);
    const extraStructural = difference(platinumSet, generated.kanji);
    const issues = [];

    if (!generated.exists) {
        issues.push(`missing generated TSV: ${exportPath}`);
    }
    if (Number.isInteger(plannedCount) && generated.exists && generated.unique !== plannedCount) {
        issues.push(`generated unique count ${generated.unique} does not match planned count ${plannedCount}`);
    }
    if (extraGolden.length > 0) {
        issues.push(`${extraGolden.length} golden entries are not present in generated TSV`);
    }
    if (extraStructural.length > 0) {
        issues.push(`${extraStructural.length} ${structuralLane.toLowerCase()} entries are not present in generated TSV`);
    }

    return {
        deckId,
        deckType,
        level,
        levelLabel: `N${level}`,
        exportPath,
        exportExists: generated.exists,
        plannedCount,
        presentRows: generated.rows,
        presentUnique: generated.unique,
        goldenCount: goldenSet.size,
        structuralLane,
        structuralCount: platinumSet.size,
        currentStandardStructuralCount: reviewStandardSummary.currentStandardCount || 0,
        legacyOrUnversionedStructuralCount: reviewStandardSummary.legacyOrUnversionedCount || 0,
        platinumCount: platinumSet.size,
        currentStandardPlatinumCount: reviewStandardSummary.currentStandardCount || 0,
        legacyOrUnversionedPlatinumCount: reviewStandardSummary.legacyOrUnversionedCount || 0,
        revalidationBacklogCount: reviewStandardSummary.revalidationBacklogCount || 0,
        currentStandardKanji: reviewStandardSummary.currentStandardKanji || [],
        legacyOrUnversionedKanji: reviewStandardSummary.legacyOrUnversionedKanji || [],
        revalidationBacklogKanji: reviewStandardSummary.revalidationBacklogKanji || [],
        verificationLimitationKanjiCount: verificationLimitationSummary.kanjiCount || 0,
        verificationLimitationCount: verificationLimitationSummary.limitationCount || 0,
        verificationLimitationFieldCounts: verificationLimitationSummary.fieldCounts || {},
        verificationLimitations: verificationLimitationSummary.limitations || [],
        missingGolden,
        missingSapphire: missingStructural,
        missingPlatinum: missingStructural,
        extraGolden,
        extraSapphire: extraStructural,
        extraPlatinum: extraStructural,
        issues,
        passed: issues.length === 0,
    };
}

function loadReviewSet(rootDir, fileName, {
    exists = fs.existsSync,
    readFile = fs.readFileSync,
    missingAsEmpty = false,
} = {}) {
    const filePath = path.join(rootDir, "templates", fileName);
    if (!exists(filePath)) {
        if (missingAsEmpty) {
            return [];
        }
        throw new Error(`Missing review set: ${filePath}`);
    }
    return readJson(filePath, { readFile });
}

function loadCoreStructuralReviewSet(rootDir, level, {
    exists = fs.existsSync,
    readFile = fs.readFileSync,
} = {}) {
    const sapphireFileName = `sapphire_n${level}_review_set.json`;
    const sapphirePath = path.join(rootDir, "templates", sapphireFileName);
    if (exists(sapphirePath)) {
        const reviewSet = loadReviewSet(rootDir, sapphireFileName, { exists, readFile });
        return {
            reviewSet,
            structuralLane: "Sapphire",
            structuralSet: buildActiveSapphireSet(reviewSet),
            reviewStandardSummary: buildKanjiSapphireReviewStandardSummary(reviewSet),
            verificationLimitationSummary: buildKanjiSapphireVerificationLimitationSummary(reviewSet),
        };
    }

    const platinumFileName = `platinum_n${level}_review_set.json`;
    const reviewSet = loadReviewSet(rootDir, platinumFileName, { exists, readFile });
    return {
        reviewSet,
        structuralLane: "legacy Platinum compatibility",
        structuralSet: buildActivePlatinumSet(reviewSet),
        reviewStandardSummary: buildKanjiReviewStandardSummary(reviewSet),
        verificationLimitationSummary: buildKanjiVerificationLimitationSummary(reviewSet),
    };
}

function buildAdditionalGeneratedRows({
    rootDir,
    additionalOutDir,
    additionalDecks,
    levels = JLPT_LEVELS,
    exists,
    readFile,
} = {}) {
    const selection = selectPhysicalAdditionalEntries(additionalDecks);
    const rows = [];

    for (const level of levels) {
        const plannedEntries = selection.entriesByLevel.get(level) || [];
        const exportPath = buildAdditionalKanjiExportPath(additionalOutDir, level);
        const platinumReviewSet = loadReviewSet(
            rootDir,
            `platinum_additional_unverified_n${level}_review_set.json`,
            { exists, readFile, missingAsEmpty: true }
        );
        rows.push({
            level,
            generated: readGeneratedKanjiSet(exportPath, { exists, readFile }),
            exportPath,
            plannedCount: plannedEntries.length,
            goldenSet: buildKanjiSetFromReviewSet(loadReviewSet(
                rootDir,
                `golden_additional_unverified_n${level}_review_set.json`,
                { exists, readFile, missingAsEmpty: true }
            )),
            structuralLane: "legacy Platinum compatibility",
            platinumSet: buildActivePlatinumSet(platinumReviewSet),
            reviewStandardSummary: buildKanjiReviewStandardSummary(platinumReviewSet),
            verificationLimitationSummary: buildKanjiVerificationLimitationSummary(platinumReviewSet),
        });
    }

    return {
        rows,
        selection,
    };
}

function summarizeDuplicateAdditionalClaims(additionalDecks = [], selection = { excludedDuplicateClaims: [] }) {
    const appearancesByKanji = new Map();

    for (const deck of additionalDecks) {
        for (const entry of deck.entries || []) {
            if (!appearancesByKanji.has(entry.kanji)) {
                appearancesByKanji.set(entry.kanji, []);
            }
            appearancesByKanji.get(entry.kanji).push({
                deckId: deck.deckId,
                targetLevel: entry.targetLevel,
                currentContractLevel: entry.currentContractLevel,
                category: entry.category,
                confidence: entry.confidence,
                sourceConsensusLevel: entry.sourceConsensusLevel,
                sourceIds: entry.sourceIds || [],
            });
        }
    }

    const selectedByKanji = new Map(
        (selection.selectedEntries || []).map((entry) => [entry.kanji, entry])
    );
    const coreRetainedKanji = new Set(selection.coreRetainedDuplicateKanji || []);
    const duplicateClaims = [...appearancesByKanji.entries()]
        .filter(([, appearances]) => appearances.length > 1)
        .map(([kanji, appearances]) => {
            const sortedAppearances = appearances.sort((a, b) => (
                Number(b.targetLevel || 0) - Number(a.targetLevel || 0)
                || a.deckId.localeCompare(b.deckId)
            ));
            const coreLevel = sortedAppearances.find((appearance) => appearance.currentContractLevel)?.currentContractLevel || null;
            return {
                kanji,
                coreLevel,
                selectedTargetLevel: selectedByKanji.get(kanji)?.targetLevel || null,
                additionalClaimStatus: coreRetainedKanji.has(kanji) ? "core-retained" : "unresolved",
                appearances: sortedAppearances,
            };
        })
        .sort((a, b) => a.kanji.localeCompare(b.kanji, "ja"));

    const suppressedClaims = selection.suppressedDuplicateClaims || [];
    return {
        duplicateKanjiCount: duplicateClaims.length,
        excludedDuplicateClaimCount: (selection.excludedDuplicateClaims || []).length,
        coreRetainedDuplicateKanjiCount: coreRetainedKanji.size,
        suppressedDuplicateClaimCount: suppressedClaims.length,
        unresolvedDuplicateKanjiCount: duplicateClaims.filter((claim) => claim.additionalClaimStatus !== "core-retained").length,
        duplicateClaims,
    };
}

function buildKanjiDeckReviewStatus({
    rootDir = process.cwd(),
    coreOutDir,
    additionalOutDir,
    contract,
    deltaReport,
    levels = JLPT_LEVELS,
    includeDisputed = false,
    candidateScope = CANDIDATE_SCOPES.ALL_SOURCE_CLAIMS,
    exists = fs.existsSync,
    readFile = fs.readFileSync,
} = {}) {
    const resolvedRoot = path.resolve(rootDir);
    const resolvedCoreOutDir = path.resolve(coreOutDir || path.join(resolvedRoot, "out", "build"));
    const resolvedAdditionalOutDir = path.resolve(additionalOutDir || path.join(resolvedRoot, "out", "build", "additional_unverified"));
    const loadedContract = contract || readJson(path.join(resolvedRoot, "templates", "jlpt_level_contract.json"), { readFile });
    const normalizedLevels = [...new Set((Array.isArray(levels) ? levels : JLPT_LEVELS)
        .map((level) => Number(level))
        .filter((level) => JLPT_LEVELS.includes(level)))];
    const contractSets = buildContractSetsByLevel(loadedContract);

    const coreRows = normalizedLevels.map((level) => {
        const exportPath = path.join(resolvedCoreOutDir, "exports", `jlpt-n${level}.tsv`);
        const structuralReview = loadCoreStructuralReviewSet(resolvedRoot, level, { exists, readFile });
        const goldenSet = buildKanjiSetFromReviewSet(loadReviewSet(
            resolvedRoot,
            `golden_n${level}_review_set.json`,
            { exists, readFile }
        ));
        return buildReviewStatusRow({
            deckId: `core_N${level}`,
            deckType: "core",
            level,
            exportPath,
            generated: readGeneratedKanjiSet(exportPath, { exists, readFile }),
            goldenSet,
            platinumSet: structuralReview.structuralSet,
            structuralLane: structuralReview.structuralLane,
            reviewStandardSummary: structuralReview.reviewStandardSummary,
            verificationLimitationSummary: structuralReview.verificationLimitationSummary,
            plannedCount: contractSets.get(level)?.size || 0,
        });
    });

    const partitionPlan = buildKanjiDeckPartitionPlan({
        contract: loadedContract,
        deltaReport,
        levels: JLPT_LEVELS,
        includeDisputed,
        candidateScope,
    });
    const additional = buildAdditionalGeneratedRows({
        rootDir: resolvedRoot,
        additionalOutDir: resolvedAdditionalOutDir,
        additionalDecks: partitionPlan.additionalDecks,
        levels: normalizedLevels,
        exists,
        readFile,
    });
    const additionalRows = additional.rows.map((row) => buildReviewStatusRow({
        deckId: `additional_unverified_N${row.level}`,
        deckType: "additional_unverified",
        level: row.level,
        exportPath: row.exportPath,
        generated: row.generated,
        goldenSet: row.goldenSet,
        platinumSet: row.platinumSet,
        structuralLane: row.structuralLane,
        reviewStandardSummary: row.reviewStandardSummary,
        verificationLimitationSummary: row.verificationLimitationSummary,
        plannedCount: row.plannedCount,
    }));
    const duplicateAdditionalClaims = summarizeDuplicateAdditionalClaims(
        partitionPlan.additionalDecks,
        additional.selection
    );
    const structuralIssues = [
        ...coreRows.flatMap((row) => row.issues.map((issue) => `${row.deckId}: ${issue}`)),
        ...additionalRows.flatMap((row) => row.issues.map((issue) => `${row.deckId}: ${issue}`)),
    ];

    if (duplicateAdditionalClaims.unresolvedDuplicateKanjiCount > 0) {
        structuralIssues.push(
            `${duplicateAdditionalClaims.unresolvedDuplicateKanjiCount} kanji have unresolved duplicate additional source claims`
        );
    }

    return {
        coreOutDir: resolvedCoreOutDir,
        additionalOutDir: resolvedAdditionalOutDir,
        levels: normalizedLevels,
        candidateScope,
        includeDisputed,
        passed: structuralIssues.length === 0,
        structuralIssues,
        duplicateAdditionalClaims,
        rows: [...coreRows, ...additionalRows],
    };
}

function formatRatio(count, total) {
    return `${count}/${total}`;
}

function formatSample(values = [], limit = 12) {
    if (values.length === 0) {
        return "none";
    }
    const sample = values.slice(0, limit).join(", ");
    return values.length > limit ? `${sample}, ...` : sample;
}

function formatKanjiDeckReviewStatus(report = {}) {
    const lines = [
        "Japanese Kanji Builder Kanji Deck Review Status",
        "",
        `Result: ${report.passed ? "passing" : "failing"}`,
        `Core output directory: ${report.coreOutDir}`,
        `Additional output directory: ${report.additionalOutDir}`,
        `Additional candidate scope: ${report.candidateScope}`,
        `Disputed rows included: ${report.includeDisputed ? "yes" : "no"}`,
        "",
        "| Deck | Level | Present | Golden | Sapphire | Current Std | Limitations | Missing Golden | Missing Sapphire | Structural |",
        "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
    ];

    for (const row of report.rows || []) {
        lines.push([
            `| ${row.deckId}`,
            row.levelLabel,
            row.exportExists ? `${row.presentUnique}/${row.presentRows}` : "missing",
            formatRatio(row.goldenCount, row.presentUnique),
            formatRatio(row.structuralCount ?? row.platinumCount, row.presentUnique),
            formatRatio(row.currentStandardStructuralCount ?? row.currentStandardPlatinumCount ?? 0, row.presentUnique),
            row.verificationLimitationCount || 0,
            row.missingGolden.length,
            (row.missingSapphire || row.missingPlatinum || []).length,
            row.passed ? "ok" : "failing",
        ].join(" | ") + " |");
    }

    const duplicates = report.duplicateAdditionalClaims || {};
    lines.push(
        "",
        "Duplicate Additional Source Claims:",
        `- duplicate kanji: ${duplicates.duplicateKanjiCount || 0}`,
        `- core-retained source-claim kanji: ${duplicates.coreRetainedDuplicateKanjiCount || 0}`,
        `- suppressed additional source claims: ${duplicates.suppressedDuplicateClaimCount || 0}`,
        `- unresolved duplicate kanji: ${duplicates.unresolvedDuplicateKanjiCount || 0}`
    );

    if ((duplicates.duplicateClaims || []).length > 0) {
        for (const duplicate of duplicates.duplicateClaims) {
            const appearances = duplicate.appearances
                .map((appearance) => `${appearance.deckId} claim N${appearance.targetLevel}`)
                .join("; ");
            const core = duplicate.coreLevel ? `core N${duplicate.coreLevel} retained` : "core placement retained";
            const selected = duplicate.selectedTargetLevel
                ? `selected additional N${duplicate.selectedTargetLevel}`
                : "no additional duplicate selected";
            lines.push(`- ${duplicate.kanji}: ${core}; ${selected}; ${appearances}`);
        }
    }

    const rowsWithLimitations = (report.rows || [])
        .filter((row) => (row.verificationLimitationCount || 0) > 0);
    if (rowsWithLimitations.length > 0) {
        lines.push("", "Verification Limitations:");
        for (const row of rowsWithLimitations) {
            lines.push(
                `- ${row.deckId}: ${row.verificationLimitationCount} limitation(s) `
                + `on ${row.verificationLimitationKanjiCount} active ${row.structuralLane || "Sapphire"} card(s)`
            );
            for (const limitation of (row.verificationLimitations || []).slice(0, 12)) {
                lines.push(`  - ${limitation.kanji}: ${limitation.field} (${limitation.status}) - ${limitation.label}`);
            }
            if ((row.verificationLimitations || []).length > 12) {
                lines.push(`  - ... ${row.verificationLimitations.length - 12} more`);
            }
        }
    }

    const legacyRows = (report.rows || [])
        .filter((row) => (row.revalidationBacklogCount ?? row.legacyOrUnversionedPlatinumCount ?? 0) > 0);
    if (legacyRows.length > 0) {
        lines.push("", "Revalidation Backlog/History:");
        for (const row of legacyRows) {
            const count = row.revalidationBacklogCount ?? row.legacyOrUnversionedPlatinumCount ?? 0;
            const kanji = row.revalidationBacklogKanji || row.legacyOrUnversionedKanji || [];
            lines.push(`- ${row.deckId}: ${count} non-certifying review-history card(s) need current-standard revalidation`);
            if (kanji.length > 0) {
                lines.push(`  - sample: ${formatSample(kanji)}`);
            }
        }
    }

    const incompleteRows = (report.rows || [])
        .filter((row) => row.missingGolden.length > 0 || (row.missingSapphire || row.missingPlatinum || []).length > 0);
    if (incompleteRows.length > 0) {
        lines.push("", "Review Gaps:");
        for (const row of incompleteRows) {
            const missingSapphire = row.missingSapphire || row.missingPlatinum || [];
            lines.push(
                `- ${row.deckId}: missing golden ${row.missingGolden.length}; `
                + `missing ${row.structuralLane || "Sapphire"} ${missingSapphire.length}`
            );
            if (row.missingGolden.length > 0) {
                lines.push(`  - missing golden sample: ${formatSample(row.missingGolden)}`);
            }
            if (missingSapphire.length > 0) {
                lines.push(`  - missing ${(row.structuralLane || "Sapphire").toLowerCase()} sample: ${formatSample(missingSapphire)}`);
            }
        }
    }

    if ((report.structuralIssues || []).length > 0) {
        lines.push("", "Hard Audit Failures:");
        for (const issue of report.structuralIssues) {
            lines.push(`- ${issue}`);
        }
    }

    return `${lines.join("\n")}\n`;
}

module.exports = {
    buildActivePlatinumSet,
    buildActiveSapphireSet,
    buildKanjiDeckReviewStatus,
    buildKanjiSetFromReviewSet,
    formatKanjiDeckReviewStatus,
    summarizeDuplicateAdditionalClaims,
};
