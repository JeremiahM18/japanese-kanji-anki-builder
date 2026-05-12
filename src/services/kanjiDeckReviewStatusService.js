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
const { ACTIVE_PLATINUM_STATUSES } = require("./platinumKanjiReviewService");

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
            .filter((entry) => ACTIVE_PLATINUM_STATUSES.includes(String(entry?.status || "").trim()))
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
    plannedCount = null,
} = {}) {
    const missingGolden = difference(generated.kanji, goldenSet);
    const missingPlatinum = difference(generated.kanji, platinumSet);
    const extraGolden = difference(goldenSet, generated.kanji);
    const extraPlatinum = difference(platinumSet, generated.kanji);
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
    if (extraPlatinum.length > 0) {
        issues.push(`${extraPlatinum.length} platinum entries are not present in generated TSV`);
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
        platinumCount: platinumSet.size,
        missingGolden,
        missingPlatinum,
        extraGolden,
        extraPlatinum,
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
            platinumSet: buildActivePlatinumSet(loadReviewSet(
                rootDir,
                `platinum_additional_unverified_n${level}_review_set.json`,
                { exists, readFile, missingAsEmpty: true }
            )),
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
    const quarantinedKanji = new Set(selection.quarantinedDuplicateKanji || []);
    const duplicateClaims = [...appearancesByKanji.entries()]
        .filter(([, appearances]) => appearances.length > 1)
        .map(([kanji, appearances]) => ({
            kanji,
            selectedTargetLevel: selectedByKanji.get(kanji)?.targetLevel || null,
            quarantineStatus: quarantinedKanji.has(kanji) ? "quarantined" : "unquarantined",
            appearances: appearances.sort((a, b) => (
                Number(b.targetLevel || 0) - Number(a.targetLevel || 0)
                || a.deckId.localeCompare(b.deckId)
            )),
        }))
        .sort((a, b) => a.kanji.localeCompare(b.kanji, "ja"));

    return {
        duplicateKanjiCount: duplicateClaims.length,
        excludedDuplicateClaimCount: (selection.excludedDuplicateClaims || []).length,
        quarantinedDuplicateKanjiCount: quarantinedKanji.size,
        quarantinedDuplicateClaimCount: (selection.quarantinedDuplicateClaims || []).length,
        unquarantinedDuplicateKanjiCount: duplicateClaims.filter((claim) => claim.quarantineStatus !== "quarantined").length,
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
        const goldenSet = buildKanjiSetFromReviewSet(loadReviewSet(
            resolvedRoot,
            `golden_n${level}_review_set.json`,
            { exists, readFile }
        ));
        const platinumSet = buildActivePlatinumSet(loadReviewSet(
            resolvedRoot,
            `platinum_n${level}_review_set.json`,
            { exists, readFile }
        ));
        return buildReviewStatusRow({
            deckId: `core_N${level}`,
            deckType: "core",
            level,
            exportPath,
            generated: readGeneratedKanjiSet(exportPath, { exists, readFile }),
            goldenSet,
            platinumSet,
            plannedCount: contractSets.get(level)?.size || 0,
        });
    });

    const partitionPlan = buildKanjiDeckPartitionPlan({
        contract: loadedContract,
        deltaReport,
        levels: normalizedLevels,
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

    if (duplicateAdditionalClaims.unquarantinedDuplicateKanjiCount > 0) {
        structuralIssues.push(
            `${duplicateAdditionalClaims.unquarantinedDuplicateKanjiCount} kanji have unquarantined duplicate additional source claims`
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
        "| Deck | Level | Present | Golden | Platinum | Missing Golden | Missing Platinum | Structural |",
        "| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |",
    ];

    for (const row of report.rows || []) {
        lines.push([
            `| ${row.deckId}`,
            row.levelLabel,
            row.exportExists ? `${row.presentUnique}/${row.presentRows}` : "missing",
            formatRatio(row.goldenCount, row.presentUnique),
            formatRatio(row.platinumCount, row.presentUnique),
            row.missingGolden.length,
            row.missingPlatinum.length,
            row.passed ? "ok" : "failing",
        ].join(" | ") + " |");
    }

    const duplicates = report.duplicateAdditionalClaims || {};
    lines.push(
        "",
        "Duplicate Additional Source Claims:",
        `- duplicate kanji: ${duplicates.duplicateKanjiCount || 0}`,
        `- quarantined duplicate kanji: ${duplicates.quarantinedDuplicateKanjiCount || 0}`,
        `- quarantined duplicate claims: ${duplicates.quarantinedDuplicateClaimCount || 0}`,
        `- unquarantined duplicate kanji: ${duplicates.unquarantinedDuplicateKanjiCount || 0}`
    );

    if ((duplicates.duplicateClaims || []).length > 0) {
        for (const duplicate of duplicates.duplicateClaims) {
            const appearances = duplicate.appearances
                .map((appearance) => `${appearance.deckId} claim N${appearance.targetLevel}`)
                .join("; ");
            const selected = duplicate.selectedTargetLevel ? `selected N${duplicate.selectedTargetLevel}` : "selected none";
            lines.push(`- ${duplicate.kanji}: ${duplicate.quarantineStatus}; ${selected}; ${appearances}`);
        }
    }

    const incompleteRows = (report.rows || [])
        .filter((row) => row.missingGolden.length > 0 || row.missingPlatinum.length > 0);
    if (incompleteRows.length > 0) {
        lines.push("", "Review Gaps:");
        for (const row of incompleteRows) {
            lines.push(
                `- ${row.deckId}: missing golden ${row.missingGolden.length}; `
                + `missing platinum ${row.missingPlatinum.length}`
            );
            if (row.missingGolden.length > 0) {
                lines.push(`  - missing golden sample: ${formatSample(row.missingGolden)}`);
            }
            if (row.missingPlatinum.length > 0) {
                lines.push(`  - missing platinum sample: ${formatSample(row.missingPlatinum)}`);
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
    buildKanjiDeckReviewStatus,
    buildKanjiSetFromReviewSet,
    formatKanjiDeckReviewStatus,
    summarizeDuplicateAdditionalClaims,
};
