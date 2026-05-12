const fs = require("node:fs");
const path = require("node:path");

const JLPT_LEVELS = [5, 4, 3, 2, 1];

function toSortedArray(values) {
    return [...values].sort((a, b) => a.localeCompare(b, "ja"));
}

function difference(left, right) {
    return toSortedArray([...left].filter((value) => !right.has(value)));
}

function findDuplicates(values = []) {
    const seen = new Set();
    const duplicates = new Set();

    for (const value of values) {
        if (seen.has(value)) {
            duplicates.add(value);
        }
        seen.add(value);
    }

    return toSortedArray(duplicates);
}

function parseKanjiTsv(text = "") {
    const lines = String(text || "")
        .trim()
        .split(/\r?\n/u)
        .filter(Boolean);
    if (lines.length === 0) {
        return {
            header: [],
            kanji: [],
        };
    }

    const header = lines[0].split("\t");
    const kanjiIndex = header.indexOf("Kanji");
    if (kanjiIndex === -1) {
        throw new Error("Generated kanji TSV is missing required Kanji header.");
    }

    return {
        header,
        kanji: lines.slice(1)
            .map((line) => String(line.split("\t")[kanjiIndex] || "").trim())
            .filter(Boolean),
    };
}

function buildContractSetsByLevel(contract = {}) {
    const sets = new Map(JLPT_LEVELS.map((level) => [level, new Set()]));

    for (const [kanji, level] of Object.entries(contract.kanjiLevels || {})) {
        const numericLevel = Number(level);
        if (sets.has(numericLevel)) {
            sets.get(numericLevel).add(kanji);
        }
    }

    return sets;
}

function buildGoldenSet(goldenReviewSet = []) {
    return new Set(
        (Array.isArray(goldenReviewSet) ? goldenReviewSet : [])
            .map((entry) => String(entry?.kanji || "").trim())
            .filter(Boolean)
    );
}

function buildLevelAuditRow({
    level,
    contractSet,
    goldenReviewSet,
    exportPath,
    exportText,
    exportExists,
}) {
    const goldenValues = (Array.isArray(goldenReviewSet) ? goldenReviewSet : [])
        .map((entry) => String(entry?.kanji || "").trim())
        .filter(Boolean);
    const goldenSet = buildGoldenSet(goldenReviewSet);
    const generatedValues = exportExists ? parseKanjiTsv(exportText).kanji : [];
    const generatedSet = new Set(generatedValues);
    const goldenMissingContract = difference(contractSet, goldenSet);
    const goldenExtraVsContract = difference(goldenSet, contractSet);
    const generatedMissingContract = difference(contractSet, generatedSet);
    const generatedExtraVsContract = difference(generatedSet, contractSet);
    const generatedMissingGolden = difference(goldenSet, generatedSet);
    const generatedExtraVsGolden = difference(generatedSet, goldenSet);
    const duplicateGoldenKanji = findDuplicates(goldenValues);
    const duplicateGeneratedKanji = findDuplicates(generatedValues);
    const issues = [];

    if (!exportExists) {
        issues.push(`missing generated TSV: ${exportPath}`);
    }
    if (goldenMissingContract.length > 0) {
        issues.push(`${goldenMissingContract.length} contract kanji missing from golden N${level}`);
    }
    if (goldenExtraVsContract.length > 0) {
        issues.push(`${goldenExtraVsContract.length} golden N${level} kanji outside contract`);
    }
    if (generatedMissingContract.length > 0) {
        issues.push(`${generatedMissingContract.length} contract kanji missing from generated N${level} TSV`);
    }
    if (generatedExtraVsContract.length > 0) {
        issues.push(`${generatedExtraVsContract.length} generated N${level} TSV kanji outside contract`);
    }
    if (generatedMissingGolden.length > 0) {
        issues.push(`${generatedMissingGolden.length} golden N${level} kanji missing from generated TSV`);
    }
    if (generatedExtraVsGolden.length > 0) {
        issues.push(`${generatedExtraVsGolden.length} generated N${level} TSV kanji outside golden review`);
    }
    if (duplicateGoldenKanji.length > 0) {
        issues.push(`${duplicateGoldenKanji.length} duplicate golden N${level} kanji`);
    }
    if (duplicateGeneratedKanji.length > 0) {
        issues.push(`${duplicateGeneratedKanji.length} duplicate generated N${level} kanji`);
    }

    return {
        level,
        levelLabel: `N${level}`,
        exportPath,
        exportExists,
        contractCount: contractSet.size,
        goldenRows: goldenValues.length,
        goldenUnique: goldenSet.size,
        generatedRows: generatedValues.length,
        generatedUnique: generatedSet.size,
        goldenMissingContract,
        goldenExtraVsContract,
        generatedMissingContract,
        generatedExtraVsContract,
        generatedMissingGolden,
        generatedExtraVsGolden,
        duplicateGoldenKanji,
        duplicateGeneratedKanji,
        issues,
        passed: issues.length === 0,
    };
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function loadGoldenReviewSet(rootDir, level) {
    return readJson(path.join(rootDir, "templates", `golden_n${level}_review_set.json`));
}

function buildKanjiDeckGeneratedSurfaceAudit({
    rootDir = process.cwd(),
    outDir,
    levels = JLPT_LEVELS,
    contract,
    goldenReviewSetsByLevel,
    readFile = fs.readFileSync,
    exists = fs.existsSync,
} = {}) {
    const resolvedRoot = path.resolve(rootDir);
    const resolvedOutDir = path.resolve(outDir || path.join(resolvedRoot, "out", "build"));
    const loadedContract = contract || readJson(path.join(resolvedRoot, "templates", "jlpt_level_contract.json"));
    const contractSets = buildContractSetsByLevel(loadedContract);
    const normalizedLevels = [...new Set((Array.isArray(levels) ? levels : JLPT_LEVELS)
        .map((level) => Number(level))
        .filter((level) => JLPT_LEVELS.includes(level)))];
    const rows = normalizedLevels.map((level) => {
        const exportPath = path.join(resolvedOutDir, "exports", `jlpt-n${level}.tsv`);
        const exportExists = exists(exportPath);
        const goldenReviewSet = goldenReviewSetsByLevel?.[level] || loadGoldenReviewSet(resolvedRoot, level);

        return buildLevelAuditRow({
            level,
            contractSet: contractSets.get(level) || new Set(),
            goldenReviewSet,
            exportPath,
            exportExists,
            exportText: exportExists ? readFile(exportPath, "utf8") : "",
        });
    });

    return {
        outDir: resolvedOutDir,
        levels: normalizedLevels,
        passed: rows.every((row) => row.passed),
        rows,
        issueCount: rows.reduce((sum, row) => sum + row.issues.length, 0),
    };
}

function formatSamples(values = [], limit = 12) {
    if (!values.length) {
        return "none";
    }
    const sample = values.slice(0, limit).join(", ");
    return values.length > limit ? `${sample}, ...` : sample;
}

function formatKanjiDeckGeneratedSurfaceAudit(report = {}) {
    const lines = [
        "Japanese Kanji Builder Generated Kanji Surface Audit",
        "",
        `Result: ${report.passed ? "passing" : "failing"}`,
        `Output directory: ${report.outDir}`,
        "",
        "| Level | Contract | Golden | Generated | Result |",
        "| --- | ---: | ---: | ---: | --- |",
    ];

    for (const row of report.rows || []) {
        lines.push([
            `| ${row.levelLabel}`,
            row.contractCount,
            `${row.goldenUnique}/${row.goldenRows}`,
            row.exportExists ? `${row.generatedUnique}/${row.generatedRows}` : "missing",
            row.passed ? "passing" : "failing",
        ].join(" | ") + " |");
    }

    const failingRows = (report.rows || []).filter((row) => !row.passed);
    if (failingRows.length > 0) {
        lines.push("", "Failures:");
        for (const row of failingRows) {
            lines.push(`- ${row.levelLabel}: ${row.issues.join("; ")}`);
            if (row.generatedMissingContract.length > 0) {
                lines.push(`  - missing contract kanji in generated TSV: ${formatSamples(row.generatedMissingContract)}`);
            }
            if (row.generatedExtraVsContract.length > 0) {
                lines.push(`  - generated TSV extras outside contract: ${formatSamples(row.generatedExtraVsContract)}`);
            }
            if (row.generatedMissingGolden.length > 0) {
                lines.push(`  - golden kanji missing from generated TSV: ${formatSamples(row.generatedMissingGolden)}`);
            }
            if (row.generatedExtraVsGolden.length > 0) {
                lines.push(`  - generated TSV extras outside golden review: ${formatSamples(row.generatedExtraVsGolden)}`);
            }
            if (row.goldenMissingContract.length > 0) {
                lines.push(`  - contract kanji missing from golden: ${formatSamples(row.goldenMissingContract)}`);
            }
            if (row.goldenExtraVsContract.length > 0) {
                lines.push(`  - golden extras outside contract: ${formatSamples(row.goldenExtraVsContract)}`);
            }
            if (row.duplicateGeneratedKanji.length > 0) {
                lines.push(`  - duplicate generated kanji: ${formatSamples(row.duplicateGeneratedKanji)}`);
            }
            if (row.duplicateGoldenKanji.length > 0) {
                lines.push(`  - duplicate golden kanji: ${formatSamples(row.duplicateGoldenKanji)}`);
            }
        }
    }

    return `${lines.join("\n")}\n`;
}

module.exports = {
    JLPT_LEVELS,
    buildContractSetsByLevel,
    buildKanjiDeckGeneratedSurfaceAudit,
    buildLevelAuditRow,
    findDuplicates,
    formatKanjiDeckGeneratedSurfaceAudit,
    parseKanjiTsv,
};
