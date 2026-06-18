const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const {
    buildDefaultNlpModelManifestPath,
    loadNlpModelManifest,
} = require("../datasets/nlpModelManifest");
const {
    NLP_TOKENIZATION_AUTHORITY,
    parseNlpTokenizationArtifact,
} = require("../datasets/nlpTokenizationArtifact");
const { ensureDir } = require("../utils/fs");

const DEFAULT_RUNTIME_ID = "kuromoji-js";
const DEFAULT_CREATED_BY = "scripts/generateNlpTokenization.js";
const TOKENIZATION_LIMITATIONS = Object.freeze([
    "kuromoji.js tokenization is assistive-only and must be human-reviewed before any learner-facing card change.",
    "Tokenization artifacts are not source evidence and do not certify Gold, Sapphire, Platinum, Obsidian, or release readiness.",
]);
const KANJI_TOKENIZATION_LIMITATIONS = Object.freeze([
    ...TOKENIZATION_LIMITATIONS,
    "Kanji-card tokenization checks the bare kanji anchor and tokenizer reading only; it does not validate kanji meanings, JLPT placement, on/kun lists, stroke order, audio, or source provenance.",
    "Tokenizer readings can prefer dictionary/common readings that differ from the curated learner-facing primary reading; normal kanji-card differences are reading-variant context, while bare-kanji unknown or missing tokenizer readings are tokenizer coverage-gap signals.",
]);

function sha256FileWithSize(filePath) {
    const bytes = fs.readFileSync(filePath);
    return {
        path: filePath,
        sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
        byteSize: bytes.length,
    };
}

function parseTsv(tsvText) {
    const lines = String(tsvText || "").trim().split(/\r?\n/).filter(Boolean);
    if (lines.length === 0) {
        return {
            header: [],
            rows: [],
        };
    }

    const header = lines[0].split("\t");
    const rows = lines.slice(1).map((line) => {
        const columns = line.split("\t");
        return Object.fromEntries(header.map((name, index) => [name, columns[index] || ""]));
    });

    return { header, rows };
}

function parseWordDeckTsvRows(tsvText) {
    const { header, rows } = parseTsv(tsvText);
    for (const fieldName of ["Word", "Reading"]) {
        if (!header.includes(fieldName)) {
            throw new Error(`Word tokenization TSV is missing required ${fieldName} column.`);
        }
    }

    return rows
        .map((row, index) => ({
            rowNumber: index + 2,
            written: String(row.Word || "").trim(),
            reading: String(row.Reading || "").trim(),
            jlptLevel: String(row.JLPTLevel || "").trim(),
        }))
        .filter((row) => row.written && row.reading);
}

function parseKanjiDeckTsvRows(tsvText) {
    const { header, rows } = parseTsv(tsvText);
    for (const fieldName of ["Kanji", "PrimaryReading"]) {
        if (!header.includes(fieldName)) {
            throw new Error(`Kanji tokenization TSV is missing required ${fieldName} column.`);
        }
    }

    return rows
        .map((row, index) => ({
            rowNumber: index + 2,
            kanji: String(row.Kanji || "").trim(),
            primaryReading: String(row.PrimaryReading || "").trim(),
            displayWord: String(row.DisplayWord || "").trim(),
        }))
        .filter((row) => row.kanji);
}

function normalizePartOfSpeech(token = {}) {
    return [
        token.pos,
        token.pos_detail_1,
        token.pos_detail_2,
        token.pos_detail_3,
    ].map((value) => String(value || "").trim())
        .filter((value) => value && value !== "*");
}

function normalizeOptionalTokenText(value) {
    const normalized = String(value || "").trim();
    return normalized && normalized !== "*" ? normalized : undefined;
}

function mapKuromojiToken(token, cursor) {
    const surface = String(token.surface_form ?? "");
    const partOfSpeech = normalizePartOfSpeech(token);
    if (!surface) {
        throw new Error("kuromoji.js produced a token with an empty surface_form.");
    }
    if (partOfSpeech.length === 0) {
        throw new Error(`kuromoji.js token ${surface} did not include part-of-speech evidence.`);
    }

    return {
        surface,
        start: cursor,
        end: cursor + surface.length,
        lemma: normalizeOptionalTokenText(token.basic_form),
        reading: normalizeOptionalTokenText(token.reading),
        pronunciation: normalizeOptionalTokenText(token.pronunciation),
        partOfSpeech,
        conjugationType: normalizeOptionalTokenText(token.conjugated_type),
        conjugationForm: normalizeOptionalTokenText(token.conjugated_form),
        known: token.word_type ? token.word_type !== "UNKNOWN" : undefined,
    };
}

function tokenizeText({ tokenizer, inputText }) {
    let cursor = 0;
    const tokens = tokenizer.tokenize(inputText).map((token) => {
        const mapped = mapKuromojiToken(token, cursor);
        cursor = mapped.end;
        return mapped;
    });
    const joined = tokens.map((token) => token.surface).join("");
    if (joined !== inputText) {
        throw new Error(`kuromoji.js token surfaces did not reconstruct input text: ${inputText}`);
    }
    return tokens;
}

function buildTokenizer({ dictionaryPath, kuromojiModule = null }) {
    const kuromoji = kuromojiModule || require("kuromoji");
    return new Promise((resolve, reject) => {
        kuromoji.builder({ dicPath: dictionaryPath }).build((error, tokenizer) => {
            if (error) {
                reject(error);
                return;
            }
            resolve(tokenizer);
        });
    });
}

function assertTokenizationRuntime({ manifest, runtimeId }) {
    const runtime = manifest.runtimes?.[runtimeId];
    if (!runtime) {
        throw new Error(`NLP tokenization runtime ${runtimeId} is not declared in the manifest.`);
    }
    if (runtime.status !== "active") {
        throw new Error(`NLP tokenization runtime ${runtimeId} is ${runtime.status}; expected active.`);
    }
    if (runtime.licenseUse?.status !== "approved") {
        throw new Error(`NLP tokenization runtime ${runtimeId} does not have approved license/use status.`);
    }
    if (!runtime.allowedTasks.includes("tokenization")) {
        throw new Error(`NLP tokenization runtime ${runtimeId} does not allow tokenization.`);
    }
    if (!runtime.dictionary?.path || !runtime.dictionary?.sha256) {
        throw new Error(`NLP tokenization runtime ${runtimeId} must pin dictionary path and SHA-256 evidence.`);
    }
    return runtime;
}

function buildTokenizationItem({ row, index, level, tokenizer }) {
    const tokens = tokenizeText({
        tokenizer,
        inputText: row.written,
    });
    const warnings = tokens.some((token) => token.known === false)
        ? ["kuromoji.js marked at least one token as UNKNOWN; human review required before using this signal."]
        : [];

    return {
        id: `n${level}-word-${String(index + 1).padStart(4, "0")}`,
        target: {
            kind: "word-card",
            deckKind: "word",
            level,
            written: row.written,
            reading: row.reading,
        },
        inputText: row.written,
        tokens,
        warnings,
        limitations: [...TOKENIZATION_LIMITATIONS],
    };
}

function buildKanjiTokenizationItem({ row, index, level, tokenizer }) {
    const tokens = tokenizeText({
        tokenizer,
        inputText: row.kanji,
    });
    const warnings = [];
    if (tokens.some((token) => token.known === false)) {
        warnings.push("kuromoji.js marked the bare kanji anchor as UNKNOWN; this is tokenizer coverage-gap evidence and not card-defect evidence by itself.");
    }
    if (!row.primaryReading) {
        warnings.push("Generated kanji row has no PrimaryReading; tokenization cannot compare tokenizer reading to the learner-facing kanji-card reading.");
    }
    if (row.displayWord && row.displayWord !== row.kanji) {
        warnings.push("DisplayWord differs from the bare kanji anchor; confirm the kanji-card product still separates kanji identity from word-deck study material.");
    }

    return {
        id: `n${level}-kanji-${String(index + 1).padStart(4, "0")}`,
        target: {
            kind: "kanji-card",
            deckKind: "kanji",
            level,
            written: row.kanji,
            ...(row.primaryReading ? { reading: row.primaryReading } : {}),
            cardId: `N${level}:${row.kanji}`,
        },
        inputText: row.kanji,
        tokens,
        warnings,
        limitations: [...KANJI_TOKENIZATION_LIMITATIONS],
    };
}

async function buildNlpWordTokenizationArtifact({
    wordTsvPath,
    manifestPath = buildDefaultNlpModelManifestPath(),
    workspaceRoot = process.cwd(),
    level = 5,
    runtimeId = DEFAULT_RUNTIME_ID,
    limit = null,
    createdBy = DEFAULT_CREATED_BY,
    now = () => new Date(),
    loadManifestFn = loadNlpModelManifest,
    buildTokenizerFn = buildTokenizer,
} = {}) {
    if (!wordTsvPath) {
        throw new Error("wordTsvPath is required for NLP word tokenization generation.");
    }
    if (!Number.isInteger(level) || level < 1 || level > 5) {
        throw new Error("NLP word tokenization level must be an integer from 1 to 5.");
    }

    const resolvedWorkspaceRoot = path.resolve(workspaceRoot);
    const resolvedWordTsvPath = path.resolve(wordTsvPath);
    const resolvedManifestPath = path.resolve(manifestPath);
    const manifest = loadManifestFn(resolvedManifestPath);
    const runtime = assertTokenizationRuntime({ manifest, runtimeId });
    const rows = parseWordDeckTsvRows(fs.readFileSync(resolvedWordTsvPath, "utf8"));
    const scopedRows = Number.isFinite(limit) ? rows.slice(0, limit) : rows;
    const tokenizer = await buildTokenizerFn({
        dictionaryPath: path.resolve(resolvedWorkspaceRoot, runtime.dictionary.path),
        runtime,
    });
    const wordTsvHash = sha256FileWithSize(resolvedWordTsvPath);
    const manifestHash = sha256FileWithSize(resolvedManifestPath);
    const artifact = {
        version: 1,
        artifactType: "nlp_tokenization_batch",
        generatedAt: now().toISOString(),
        generator: {
            runtimeId,
            runId: `${runtimeId}-word-n${level}-${wordTsvHash.sha256.slice(0, 12)}`,
            manifestPath: path.relative(resolvedWorkspaceRoot, resolvedManifestPath).replace(/\\/g, "/"),
            createdBy,
            inputHashes: [wordTsvHash, manifestHash].map((entry) => ({
                path: path.relative(resolvedWorkspaceRoot, entry.path).replace(/\\/g, "/"),
                sha256: entry.sha256,
                byteSize: entry.byteSize,
            })),
        },
        runtime: {
            runtimeId,
            tokenizerKind: runtimeId === "kuromoji-js" ? "kuromoji-js" : "fixture",
            packageName: runtime.packageName,
            packageVersion: runtime.packageVersion,
            dictionaryId: `${runtimeId}:${runtime.dictionary.sha256.slice(0, 12)}`,
            dictionaryPath: runtime.dictionary.path,
            dictionarySha256: runtime.dictionary.sha256,
            deterministic: {
                requiresPinnedRuntime: true,
                requiresPinnedDictionary: true,
                requiresPinnedInputs: true,
            },
        },
        authority: { ...NLP_TOKENIZATION_AUTHORITY },
        scope: {
            targetKind: "word-card",
            levels: [level],
            source: "generated-word-rows",
            description: `Generated word TSV tokenization for JLPT N${level} word-card surfaces.`,
        },
        items: scopedRows.map((row, index) => buildTokenizationItem({
            row,
            index,
            level,
            tokenizer,
        })),
    };

    return parseNlpTokenizationArtifact(artifact);
}

async function buildNlpKanjiTokenizationArtifact({
    kanjiTsvPath,
    manifestPath = buildDefaultNlpModelManifestPath(),
    workspaceRoot = process.cwd(),
    level = 5,
    runtimeId = DEFAULT_RUNTIME_ID,
    limit = null,
    createdBy = DEFAULT_CREATED_BY,
    now = () => new Date(),
    loadManifestFn = loadNlpModelManifest,
    buildTokenizerFn = buildTokenizer,
} = {}) {
    if (!kanjiTsvPath) {
        throw new Error("kanjiTsvPath is required for NLP kanji tokenization generation.");
    }
    if (!Number.isInteger(level) || level < 1 || level > 5) {
        throw new Error("NLP kanji tokenization level must be an integer from 1 to 5.");
    }

    const resolvedWorkspaceRoot = path.resolve(workspaceRoot);
    const resolvedKanjiTsvPath = path.resolve(kanjiTsvPath);
    const resolvedManifestPath = path.resolve(manifestPath);
    const manifest = loadManifestFn(resolvedManifestPath);
    const runtime = assertTokenizationRuntime({ manifest, runtimeId });
    const rows = parseKanjiDeckTsvRows(fs.readFileSync(resolvedKanjiTsvPath, "utf8"));
    const scopedRows = Number.isFinite(limit) ? rows.slice(0, limit) : rows;
    const tokenizer = await buildTokenizerFn({
        dictionaryPath: path.resolve(resolvedWorkspaceRoot, runtime.dictionary.path),
        runtime,
    });
    const kanjiTsvHash = sha256FileWithSize(resolvedKanjiTsvPath);
    const manifestHash = sha256FileWithSize(resolvedManifestPath);
    const artifact = {
        version: 1,
        artifactType: "nlp_tokenization_batch",
        generatedAt: now().toISOString(),
        generator: {
            runtimeId,
            runId: `${runtimeId}-kanji-n${level}-${kanjiTsvHash.sha256.slice(0, 12)}`,
            manifestPath: path.relative(resolvedWorkspaceRoot, resolvedManifestPath).replace(/\\/g, "/"),
            createdBy,
            inputHashes: [kanjiTsvHash, manifestHash].map((entry) => ({
                path: path.relative(resolvedWorkspaceRoot, entry.path).replace(/\\/g, "/"),
                sha256: entry.sha256,
                byteSize: entry.byteSize,
            })),
        },
        runtime: {
            runtimeId,
            tokenizerKind: runtimeId === "kuromoji-js" ? "kuromoji-js" : "fixture",
            packageName: runtime.packageName,
            packageVersion: runtime.packageVersion,
            dictionaryId: `${runtimeId}:${runtime.dictionary.sha256.slice(0, 12)}`,
            dictionaryPath: runtime.dictionary.path,
            dictionarySha256: runtime.dictionary.sha256,
            deterministic: {
                requiresPinnedRuntime: true,
                requiresPinnedDictionary: true,
                requiresPinnedInputs: true,
            },
        },
        authority: { ...NLP_TOKENIZATION_AUTHORITY },
        scope: {
            targetKind: "kanji-card",
            levels: [level],
            source: "generated-kanji-rows",
            description: `Generated kanji TSV tokenization for JLPT N${level} kanji-card anchor surfaces.`,
        },
        items: scopedRows.map((row, index) => buildKanjiTokenizationItem({
            row,
            index,
            level,
            tokenizer,
        })),
    };

    return parseNlpTokenizationArtifact(artifact);
}

async function writeNlpWordTokenizationArtifact({
    outPath,
    ...options
} = {}) {
    if (!outPath) {
        throw new Error("outPath is required for NLP word tokenization generation.");
    }
    const artifact = await buildNlpWordTokenizationArtifact(options);
    const resolvedOutPath = path.resolve(outPath);
    ensureDir(path.dirname(resolvedOutPath));
    fs.writeFileSync(resolvedOutPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
    return {
        outPath: resolvedOutPath,
        artifact,
    };
}

async function writeNlpKanjiTokenizationArtifact({
    outPath,
    ...options
} = {}) {
    if (!outPath) {
        throw new Error("outPath is required for NLP kanji tokenization generation.");
    }
    const artifact = await buildNlpKanjiTokenizationArtifact(options);
    const resolvedOutPath = path.resolve(outPath);
    ensureDir(path.dirname(resolvedOutPath));
    fs.writeFileSync(resolvedOutPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
    return {
        outPath: resolvedOutPath,
        artifact,
    };
}

function formatNlpTokenizationGenerationSummary({ outPath, artifact }) {
    return [
        "Japanese Kanji Builder NLP Tokenization Generation",
        "",
        `Artifact: ${outPath}`,
        `Runtime: ${artifact.runtime.runtimeId}`,
        `Scope: ${artifact.scope.levels.map((level) => `N${level}`).join(", ")} ${artifact.scope.targetKind}`,
        `Items: ${artifact.items.length}`,
        `Tokens: ${artifact.items.reduce((sum, item) => sum + item.tokens.length, 0)}`,
        "",
        "Release boundary:",
        `- tokenization artifacts certify cards: ${artifact.authority.certifiesCards ? "yes" : "no"}`,
        `- tokenization artifacts may write tracked templates directly: ${artifact.authority.writesTrackedTemplates ? "yes" : "no"}`,
        `- human promotion required: ${artifact.authority.promotionPolicy === "human_review_required" ? "yes" : "no"}`,
        "",
    ].join("\n");
}

module.exports = {
    buildNlpKanjiTokenizationArtifact,
    buildNlpWordTokenizationArtifact,
    buildTokenizer,
    formatNlpTokenizationGenerationSummary,
    parseKanjiDeckTsvRows,
    parseWordDeckTsvRows,
    tokenizeText,
    writeNlpKanjiTokenizationArtifact,
    writeNlpWordTokenizationArtifact,
};
