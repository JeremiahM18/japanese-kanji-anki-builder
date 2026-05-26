const fs = require("node:fs");
const path = require("node:path");

const {
    auditKanjiCardFieldSourceContract,
    defaultKanjiCardFieldSourceContractPathForLevel,
    loadKanjiCardFieldSourceContract,
} = require("../src/datasets/kanjiCardFieldSourceContract");
const { loadKanjiReadingReferenceContract } = require("../src/datasets/kanjiReadingReferenceContract");
const { loadJlptLevelContract } = require("../src/datasets/jlptLevelContract");
const { loadPlatinumCardSourceManifest } = require("../src/datasets/platinumCardSourceManifest");
const {
    DEFAULT_CHECKED_AT,
    DEFAULT_LEVEL,
    buildKanjiCardFieldSourceContract,
} = require("../src/services/kanjiCardFieldSourceContractService");
const {
    loadKanjiSourceOriginEvidence,
    resolveKanjiSourceOriginIdsForEntry,
} = require("../src/services/platinumKanjiSourceOriginService");
const {
    assertNoUnknownArgs,
    collectUnknownArg,
} = require("../src/utils/cliArgs");

const DEFAULT_OUT = defaultKanjiCardFieldSourceContractPathForLevel(DEFAULT_LEVEL);
const DEFAULT_JLPT_CONTRACT = "templates/jlpt_level_contract.json";
const DEFAULT_SOURCE_MANIFEST = "templates/platinum_card_source_manifest.json";
const DEFAULT_SOURCE_EVIDENCE = "templates/jlpt_kanji_source_evidence.json";
const DEFAULT_READING_REFERENCE = "templates/kanji_reading_reference_contract.json";

function defaultReviewSet(level = DEFAULT_LEVEL) {
    return `templates/platinum_n${level}_review_set.json`;
}

function parseArgs(argv) {
    const options = {
        level: DEFAULT_LEVEL,
        out: null,
        reviewSet: defaultReviewSet(DEFAULT_LEVEL),
        jlptContract: DEFAULT_JLPT_CONTRACT,
        sourceManifest: DEFAULT_SOURCE_MANIFEST,
        sourceEvidence: DEFAULT_SOURCE_EVIDENCE,
        readingReference: DEFAULT_READING_REFERENCE,
        checkedAt: DEFAULT_CHECKED_AT,
        json: false,
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg === "--json") {
            options.json = true;
        } else if (arg.startsWith("--level=")) {
            options.level = Number(arg.slice("--level=".length));
            options.reviewSet = defaultReviewSet(options.level);
        } else if (arg.startsWith("--out=")) {
            options.out = arg.slice("--out=".length);
        } else if (arg.startsWith("--review-set=")) {
            options.reviewSet = arg.slice("--review-set=".length);
        } else if (arg.startsWith("--jlpt-contract=")) {
            options.jlptContract = arg.slice("--jlpt-contract=".length);
        } else if (arg.startsWith("--source-manifest=")) {
            options.sourceManifest = arg.slice("--source-manifest=".length);
        } else if (arg.startsWith("--source-evidence=")) {
            options.sourceEvidence = arg.slice("--source-evidence=".length);
        } else if (arg.startsWith("--reading-reference=")) {
            options.readingReference = arg.slice("--reading-reference=".length);
        } else if (arg.startsWith("--checked-at=")) {
            options.checkedAt = arg.slice("--checked-at=".length);
        } else {
            collectUnknownArg(options, arg);
        }
    }

    return {
        ...options,
        out: options.out || defaultKanjiCardFieldSourceContractPathForLevel(options.level),
    };
}

function formatBuildReport({ options, outPath, audit } = {}) {
    return [
        "Kanji Card Field Source Contract",
        "",
        `Level: N${options.level}`,
        `Review set: ${options.reviewSet}`,
        `Output: ${outPath}`,
        `Audit result: ${audit.passed ? "passing" : "failing"}`,
        `Expected kanji: ${audit.counts.expectedKanji}`,
        `Contract entries: ${audit.counts.entries}`,
        `Missing entries: ${audit.counts.missing}`,
        `Extra entries: ${audit.counts.extra}`,
        "",
        "Source-use boundary:",
        "- allowed: kanji-field-verification",
        "- disallowed: word-field-verification, placement-claim-origin, level-truth, generated-surface, golden-regression, media/audio provenance, review certification",
        "",
        "This command writes a tracked card-field provenance contract from current-standard Platinum japanese-source evidence. It does not move JLPT levels, read ignored data/, bulk-copy restricted sources, certify Obsidian proof, or claim release readiness.",
    ].join("\n");
}

function run(options = {}) {
    const level = Number(options.level || DEFAULT_LEVEL);

    const cwd = process.cwd();
    const outPath = path.resolve(cwd, options.out || defaultKanjiCardFieldSourceContractPathForLevel(level));
    const jlptContractPath = path.resolve(cwd, options.jlptContract || DEFAULT_JLPT_CONTRACT);
    const sourceManifestPath = path.resolve(cwd, options.sourceManifest || DEFAULT_SOURCE_MANIFEST);
    const sourceEvidencePath = path.resolve(cwd, options.sourceEvidence || DEFAULT_SOURCE_EVIDENCE);
    const readingReferencePath = path.resolve(cwd, options.readingReference || DEFAULT_READING_REFERENCE);
    const reviewSetPath = path.resolve(cwd, options.reviewSet || defaultReviewSet(level));

    const jlptLevelContract = loadJlptLevelContract(jlptContractPath);
    const platinumCardSourceManifest = loadPlatinumCardSourceManifest(sourceManifestPath);
    const sourceOriginEvidence = loadKanjiSourceOriginEvidence(sourceEvidencePath);
    const readingReferenceContract = loadKanjiReadingReferenceContract(readingReferencePath);
    const platinumEntries = JSON.parse(fs.readFileSync(reviewSetPath, "utf8"));

    const contract = buildKanjiCardFieldSourceContract({
        jlptLevelContract,
        platinumEntries,
        platinumCardSourceManifest,
        sourceOriginIdsByKanji: Object.fromEntries(platinumEntries.map((entry) => [
            entry.kanji,
            resolveKanjiSourceOriginIdsForEntry({
                evidence: sourceOriginEvidence,
                entry,
            }),
        ])),
        level,
        checkedAt: options.checkedAt || DEFAULT_CHECKED_AT,
        reviewSetPath: options.reviewSet || defaultReviewSet(level),
        jlptLevelContractPath: options.jlptContract || DEFAULT_JLPT_CONTRACT,
        sourceManifestPath: options.sourceManifest || DEFAULT_SOURCE_MANIFEST,
        sourceOriginEvidencePath: options.sourceEvidence || DEFAULT_SOURCE_EVIDENCE,
    });

    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, `${JSON.stringify(contract, null, 2)}\n`, "utf8");

    const writtenContract = loadKanjiCardFieldSourceContract(outPath);
    const audit = auditKanjiCardFieldSourceContract({
        fieldSourceContract: writtenContract,
        jlptLevelContract,
        platinumCardSourceManifest,
        readingReferenceContract,
        level,
    });

    if (!audit.passed) {
        throw new Error(`Generated kanji card field source contract failed audit:\n${audit.failures.join("\n")}`);
    }

    return {
        options: { ...options, level },
        outPath,
        contract: writtenContract,
        audit,
    };
}

function main(argv = process.argv.slice(2)) {
    const options = parseArgs(argv);
    assertNoUnknownArgs("data:build:kanji-field-source-contract", options.unknownArgs);
    const report = run(options);
    if (options.json) {
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
        process.stdout.write(`${formatBuildReport(report)}\n`);
    }
}

if (require.main === module) {
    main();
}

module.exports = {
    DEFAULT_JLPT_CONTRACT,
    DEFAULT_OUT,
    DEFAULT_READING_REFERENCE,
    DEFAULT_SOURCE_EVIDENCE,
    DEFAULT_SOURCE_MANIFEST,
    defaultReviewSet,
    formatBuildReport,
    main,
    parseArgs,
    run,
};
