const fs = require("node:fs");
const path = require("node:path");

const { loadJlptWordLevelContract } = require("../datasets/jlptWordLevelContract");
const { buildWordStudyEntryKey, hasPhraseTag, loadWordStudyData } = require("../datasets/wordStudyData");
const { loadWordPitchAccentData, normalizeWordPitchAccentData } = require("../datasets/wordPitchAccentData");
const { katakanaToHiragana } = require("../utils/japanese");

const KANJIUM_SOURCE_ID = "kanjium-cc-by-sa-4.0";
const SMALL_KANA = new Set(Array.from("ゃゅょぁぃぅぇぉゎャュョァィゥェォヮ"));
const KANJI_NUMERAL_TO_FULLWIDTH = new Map([
    ["一", "１"],
    ["二", "２"],
    ["三", "３"],
    ["四", "４"],
    ["五", "５"],
    ["六", "６"],
    ["七", "７"],
    ["八", "８"],
    ["九", "９"],
    ["十", "１０"],
]);

function parseLevels(value) {
    return String(value || "5")
        .split(",")
        .map((level) => Number(level.trim()))
        .filter((level) => Number.isInteger(level) && level >= 1 && level <= 5);
}

function parseArgs(argv) {
    const options = {
        levels: [5],
        accentsPath: path.resolve("downloads", "kanjium", "accents.txt"),
        pitchDataPath: path.resolve("templates", "word_pitch_accent_data.json"),
        starterPath: path.resolve("templates", "starter_word_study_data.json"),
        contractPath: path.resolve("templates", "jlpt_word_level_contract.json"),
        overwrite: argv.includes("--overwrite"),
        requireComplete: argv.includes("--require-complete"),
    };

    for (const arg of argv) {
        if (arg === "--overwrite" || arg === "--require-complete") {
            continue;
        }
        if (arg.startsWith("--levels=")) {
            options.levels = parseLevels(arg.split("=")[1]);
        } else if (arg.startsWith("--accents-path=")) {
            options.accentsPath = path.resolve(arg.split("=")[1]);
        } else if (arg.startsWith("--pitch-data-path=")) {
            options.pitchDataPath = path.resolve(arg.split("=")[1]);
        } else if (arg.startsWith("--starter-path=")) {
            options.starterPath = path.resolve(arg.split("=")[1]);
        } else if (arg.startsWith("--contract-path=")) {
            options.contractPath = path.resolve(arg.split("=")[1]);
        } else {
            throw new Error(`Unknown argument: ${arg}`);
        }
    }

    if (options.levels.length === 0) {
        throw new Error("At least one JLPT level is required.");
    }

    return options;
}

function normalizeReading(value) {
    return katakanaToHiragana(String(value || "").trim());
}

function expandIterationMarks(value) {
    let previous = "";
    return Array.from(String(value || "")).map((char) => {
        if (char === "々" && previous) {
            return previous;
        }
        previous = char;
        return char;
    }).join("");
}

function buildWrittenVariants(written) {
    const normalized = String(written || "").trim();
    const variants = new Set([normalized, expandIterationMarks(normalized)]);
    const digitVariant = Array.from(normalized)
        .map((char) => KANJI_NUMERAL_TO_FULLWIDTH.get(char) || char)
        .join("");
    variants.add(digitVariant);
    variants.add(expandIterationMarks(digitVariant));
    return [...variants].filter(Boolean);
}

function countMoras(reading) {
    let count = 0;
    for (const char of Array.from(String(reading || ""))) {
        if (SMALL_KANA.has(char)) {
            continue;
        }
        count += 1;
    }
    return count;
}

function classifyAccent(accent, reading) {
    const accentNumber = Number(accent);
    if (accentNumber === 0) {
        return "heiban";
    }
    if (accentNumber === 1) {
        return "atamadaka";
    }
    if (accentNumber >= countMoras(reading)) {
        return "odaka";
    }
    return "nakadaka";
}

function formatPitchAccentPattern(rawAccent, reading) {
    const accentNumbers = [...new Set(
        String(rawAccent || "")
            .match(/\d+/g)
            ?.map((value) => Number(value))
            .filter((value) => Number.isInteger(value) && value >= 0) || []
    )];

    if (accentNumbers.length === 0) {
        return "";
    }

    return accentNumbers
        .map((accent) => `${accent} [${classifyAccent(accent, reading)}]`)
        .join(" / ");
}

function parseKanjiumAccents(text) {
    const index = new Map();
    for (const line of String(text || "").split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) {
            continue;
        }

        const [word, reading, accent] = trimmed.split("\t");
        if (!word || !reading || !accent) {
            continue;
        }

        const key = buildWordStudyEntryKey({
            written: word,
            reading: normalizeReading(reading),
        });
        if (!index.has(key)) {
            index.set(key, []);
        }
        index.get(key).push({
            sourceWord: word,
            sourceReading: reading,
            normalizedReading: normalizeReading(reading),
            sourceAccent: accent,
        });
    }
    return index;
}

function findKanjiumMatch({ written, reading, kanjiumIndex }) {
    for (const variant of buildWrittenVariants(written)) {
        const matches = kanjiumIndex.get(buildWordStudyEntryKey({
            written: variant,
            reading: normalizeReading(reading),
        }));
        if (matches?.length > 0) {
            return matches[0];
        }
    }
    return null;
}

function collectDeckEligibleEntries({ levels, starterEntries, jlptWordLevelContract }) {
    const levelSet = new Set(levels);
    return Object.entries(jlptWordLevelContract?.wordLevels || {})
        .filter(([, contractEntry]) => levelSet.has(Number(contractEntry?.jlpt)))
        .map(([key]) => starterEntries[key])
        .filter((entry) => entry && !hasPhraseTag(entry))
        .sort((a, b) => (
            Number(b.jlpt || 0) - Number(a.jlpt || 0)
            || String(a.written).localeCompare(String(b.written))
            || String(a.reading).localeCompare(String(b.reading))
        ));
}

function importKanjiumPitchAccents({
    kanjiumText,
    starterEntries,
    jlptWordLevelContract,
    pitchAccentData,
    levels,
    overwrite = false,
}) {
    const kanjiumIndex = parseKanjiumAccents(kanjiumText);
    const nextData = normalizeWordPitchAccentData(pitchAccentData);
    const deckEntries = collectDeckEligibleEntries({ levels, starterEntries, jlptWordLevelContract });
    const imported = [];
    const skippedExisting = [];
    const missing = [];

    for (const entry of deckEntries) {
        const key = buildWordStudyEntryKey(entry);
        if (nextData.entries[key] && !overwrite) {
            skippedExisting.push({ written: entry.written, reading: entry.reading });
            continue;
        }

        const match = findKanjiumMatch({
            written: entry.written,
            reading: entry.reading,
            kanjiumIndex,
        });
        const pattern = match ? formatPitchAccentPattern(match.sourceAccent, entry.reading) : "";
        if (!match || !pattern) {
            missing.push({ written: entry.written, reading: entry.reading });
            continue;
        }

        nextData.entries[key] = {
            pattern,
            sourceId: KANJIUM_SOURCE_ID,
            sourceWord: match.sourceWord,
            sourceReading: match.sourceReading,
            sourceAccent: match.sourceAccent,
        };
        imported.push({ written: entry.written, reading: entry.reading, pattern });
    }

    return {
        data: normalizeWordPitchAccentData(nextData),
        summary: {
            levels,
            totalDeckEntries: deckEntries.length,
            imported: imported.length,
            skippedExisting: skippedExisting.length,
            missing: missing.length,
            coverageAfterImport: deckEntries.length > 0
                ? Number((((deckEntries.length - missing.length) / deckEntries.length) * 100).toFixed(1))
                : 0,
        },
        imported,
        skippedExisting,
        missing,
    };
}

function formatImportSummary(report) {
    const lines = [
        "Japanese Kanji Builder Kanjium Pitch Import",
        "",
        `Levels: ${report.summary.levels.map((level) => `N${level}`).join(", ")}`,
        `Deck-eligible words: ${report.summary.totalDeckEntries}`,
        `Imported: ${report.summary.imported}`,
        `Skipped existing: ${report.summary.skippedExisting}`,
        `Missing from Kanjium: ${report.summary.missing}`,
        `Coverage after import: ${report.summary.coverageAfterImport}%`,
    ];

    if (report.missing.length > 0) {
        lines.push("", "Missing examples:");
        for (const row of report.missing.slice(0, 40)) {
            lines.push(`- ${row.written} (${row.reading})`);
        }
    }

    return `${lines.join("\n")}\n`;
}

function main() {
    const options = parseArgs(process.argv.slice(2));
    if (!fs.existsSync(options.accentsPath)) {
        throw new Error(`Missing Kanjium accents file at ${options.accentsPath}. Download data/source_files/raw/accents.txt first.`);
    }

    const starterEntries = loadWordStudyData({
        starterPath: options.starterPath,
        localPath: null,
    });
    const jlptWordLevelContract = loadJlptWordLevelContract(options.contractPath);
    const pitchAccentData = loadWordPitchAccentData(options.pitchDataPath);
    const report = importKanjiumPitchAccents({
        kanjiumText: fs.readFileSync(options.accentsPath, "utf-8"),
        starterEntries,
        jlptWordLevelContract,
        pitchAccentData,
        levels: options.levels,
        overwrite: options.overwrite,
    });

    fs.writeFileSync(options.pitchDataPath, `${JSON.stringify(report.data, null, 2)}\n`, "utf-8");
    process.stdout.write(formatImportSummary(report));
    if (options.requireComplete && report.summary.missing > 0) {
        process.exitCode = 1;
    }
}

module.exports = {
    buildWrittenVariants,
    classifyAccent,
    collectDeckEligibleEntries,
    countMoras,
    findKanjiumMatch,
    formatImportSummary,
    formatPitchAccentPattern,
    importKanjiumPitchAccents,
    main,
    parseArgs,
    parseKanjiumAccents,
};
