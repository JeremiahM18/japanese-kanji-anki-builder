const { createInferenceEngine } = require("../inference/inferenceEngine");
const { buildMeaningJP } = require("../inference/meaningInference");
const { inferSentenceCandidates, scoreCorpusSentence } = require("../inference/sentenceInference");
const {
    createExportService,
    formatAnkiAudioField,
    formatAnkiStrokeOrderField,
    formatExampleSentence,
} = require("./exportService");
const { buildOfflineFallbackCard } = require("./previewCardService");
const { mapWithConcurrency } = require("../utils/concurrency");
const { tsvEscape } = require("../utils/text");
const { HAN_CHAR_RE, KATAKANA_ONLY_RE, isKanaOnly, katakanaToHiragana } = require("../utils/japanese");
const { loadAnkiNoteSchema } = require("../config/ankiNoteSchema");
const { buildWordStudyEntryKey } = require("../datasets/wordStudyData");
const { resolveWordPitchAccent } = require("../datasets/wordPitchAccentData");
const { buildPitchAccentHtml, escapeHtml } = require("./pitchAccentRenderService");
const { findManagedWordAudioAsset } = require("./wordAudioService");

const WORD_FIELD_NAMES = loadAnkiNoteSchema("word").fieldNames;
const EXCLUDED_WORD_CARD_TAGS = new Set(["phrase"]);
const PHRASE_ENDING_RE = /(の近く|の部屋|の友だち|の下)$/u;
const LEXICALIZED_USAGE_SUFFIX_RE = /[\p{Script=Han}々]い方$/u;
const ADJECTIVE_NOUN_PHRASE_RE = /\p{Script=Hiragana}*い[\p{Script=Han}々]+$/u;
const DEFAULT_WORD_DECK_ORDER_SEED = "jkb-word-deck-study-order-v1";

function extractConstituentKanji(text) {
    return [...new Set(Array.from(String(text ?? "")).filter((char) => HAN_CHAR_RE.test(char) && char !== "々"))];
}

function hasExcludedWordCardTag(entry) {
    return (Array.isArray(entry?.tags) ? entry.tags : [])
        .map((tag) => String(tag || "").trim().toLowerCase())
        .some((tag) => EXCLUDED_WORD_CARD_TAGS.has(tag));
}

function isLikelyPhraseCard(candidate) {
    const written = String(candidate?.written || "").trim();
    if (!written) {
        return false;
    }

    if (PHRASE_ENDING_RE.test(written)) {
        return true;
    }

    if (LEXICALIZED_USAGE_SUFFIX_RE.test(written)) {
        return false;
    }

    return ADJECTIVE_NOUN_PHRASE_RE.test(written) && extractConstituentKanji(written).length >= 2;
}

function inferWordLevel({ written, jlptOnlyJson, fallbackLevel = null }) {
    const constituentLevels = extractConstituentKanji(written)
        .map((kanji) => jlptOnlyJson?.[kanji]?.jlpt)
        .filter((level) => Number.isInteger(level));

    if (constituentLevels.length === 0) {
        return fallbackLevel;
    }

    return Math.min(...constituentLevels);
}

function getCanonicalWordLevel({ candidate, jlptWordLevelContract }) {
    const key = buildWordStudyEntryKey({
        written: String(candidate?.written || "").trim(),
        reading: String(candidate?.reading || candidate?.pron || "").trim(),
    });
    const entry = jlptWordLevelContract?.wordLevels?.[key];
    return Number.isInteger(entry?.jlpt) ? entry.jlpt : null;
}

function buildWordKey(candidate) {
    return buildWordStudyEntryKey({
        written: String(candidate?.written || "").trim(),
        reading: String(candidate?.pron || "").trim(),
    });
}

function hashStringToUint32(value) {
    let hash = 2166136261;
    for (const char of String(value ?? "")) {
        hash ^= char.codePointAt(0);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function compareWordDeckAuditOrder(a, b) {
    return (
        (b.candidate.score || 0) - (a.candidate.score || 0)
        || a.candidate.written.length - b.candidate.written.length
        || a.candidate.written.localeCompare(b.candidate.written)
        || a.candidate.pron.localeCompare(b.candidate.pron)
    );
}

function getWordDeckStudyGroupKey(entry) {
    const sourceKanji = Array.from(entry?.sourceKanji || []).filter(Boolean);
    if (sourceKanji.length > 0) {
        return sourceKanji[0];
    }

    const constituentKanji = extractConstituentKanji(entry?.candidate?.written);
    return constituentKanji[0] || String(entry?.candidate?.written || "");
}

function getWordDeckStudyOrderKey(entry, { levelNumber, seed = DEFAULT_WORD_DECK_ORDER_SEED } = {}) {
    const candidate = entry?.candidate || {};
    return hashStringToUint32([
        seed,
        `N${levelNumber || ""}`,
        String(candidate.written || ""),
        String(candidate.pron || ""),
    ].join("|"));
}

function hasWordStudyTag(entry, tag) {
    return (Array.isArray(entry?.curatedEntry?.tags) ? entry.curatedEntry.tags : [])
        .some((value) => String(value || "").trim().toLowerCase() === tag);
}

function countOutsideLevelKanji(entry, { levelNumber, jlptOnlyJson } = {}) {
    return extractConstituentKanji(entry?.candidate?.written)
        .filter((kanji) => {
            const kanjiLevel = jlptOnlyJson?.[kanji]?.jlpt;
            return Number.isInteger(kanjiLevel) && kanjiLevel !== levelNumber;
        })
        .length;
}

function getWordDeckCurriculumScore(entry, { levelNumber, jlptOnlyJson } = {}) {
    const written = String(entry?.candidate?.written || "");
    const constituentKanji = extractConstituentKanji(written);
    const role = String(entry?.curatedEntry?.coverage?.role || "").trim().toLowerCase();
    const commonOrCore = hasWordStudyTag(entry, "common") || hasWordStudyTag(entry, "core");
    const outsideLevelKanji = countOutsideLevelKanji(entry, { levelNumber, jlptOnlyJson });

    let score = 0;
    score += commonOrCore ? 0 : 12;
    score += role === "support" ? 18 : 0;
    score += Math.max(0, constituentKanji.length - 1) * 8;
    score += outsideLevelKanji * 10;
    score += Math.max(0, written.length - 3) * 3;

    return score;
}

function getWordDeckCurriculumTier(entry, options = {}) {
    const score = getWordDeckCurriculumScore(entry, options);
    if (score <= 5) {
        return 0;
    }
    if (score <= 16) {
        return 1;
    }
    if (score <= 28) {
        return 2;
    }
    return 3;
}

function sortWordDeckEntriesForStudy(entries, { levelNumber, jlptOnlyJson, seed = DEFAULT_WORD_DECK_ORDER_SEED } = {}) {
    const buckets = new Map();

    for (const entry of entries || []) {
        const tier = getWordDeckCurriculumTier(entry, { levelNumber, jlptOnlyJson });
        const groupKey = `${tier}|${getWordDeckStudyGroupKey(entry)}`;
        if (!buckets.has(groupKey)) {
            buckets.set(groupKey, { tier, entries: [] });
        }
        buckets.get(groupKey).entries.push(entry);
    }

    const orderedBuckets = [...buckets.entries()]
        .map(([groupKey, bucket]) => ({
            tier: bucket.tier,
            groupKey,
            bucket: [...bucket.entries].sort((a, b) => (
                getWordDeckCurriculumScore(a, { levelNumber, jlptOnlyJson })
                - getWordDeckCurriculumScore(b, { levelNumber, jlptOnlyJson })
                || getWordDeckStudyOrderKey(a, { levelNumber, seed }) - getWordDeckStudyOrderKey(b, { levelNumber, seed })
                || compareWordDeckAuditOrder(a, b)
            )),
        }))
        .sort((a, b) => (
            a.tier - b.tier
            || hashStringToUint32(`${seed}|N${levelNumber || ""}|group|${a.groupKey}`)
            - hashStringToUint32(`${seed}|N${levelNumber || ""}|group|${b.groupKey}`)
            || String(a.groupKey).localeCompare(String(b.groupKey))
        ));

    const ordered = [];
    for (const tier of [...new Set(orderedBuckets.map((item) => item.tier))].sort((a, b) => a - b)) {
        const tierBuckets = orderedBuckets.filter((item) => item.tier === tier);
        let remaining = tierBuckets.reduce((sum, item) => sum + item.bucket.length, 0);
        let round = 0;
        while (remaining > 0) {
            const roundBuckets = [...tierBuckets].sort((a, b) => (
                hashStringToUint32(`${seed}|N${levelNumber || ""}|tier|${tier}|round|${round}|${a.groupKey}`)
                - hashStringToUint32(`${seed}|N${levelNumber || ""}|tier|${tier}|round|${round}|${b.groupKey}`)
                || String(a.groupKey).localeCompare(String(b.groupKey))
            ));

            for (const item of roundBuckets) {
                const entry = item.bucket.shift();
                if (!entry) {
                    continue;
                }
                ordered.push(entry);
                remaining -= 1;
            }
            round += 1;
        }
    }

    return ordered;
}

function formatPitchAccent({ candidate, curatedEntry, wordPitchAccentData }) {
    const explicitPitchAccent = String(curatedEntry?.pitchAccent || "").trim();
    if (explicitPitchAccent) {
        return buildPitchAccentHtml({
            pattern: explicitPitchAccent,
            reading: curatedEntry?.reading || candidate?.pron,
        });
    }

    const pitchAccent = resolveWordPitchAccent({
        written: candidate?.written,
        reading: curatedEntry?.reading || candidate?.pron,
        wordPitchAccentData,
    });

    return buildPitchAccentHtml({
        pattern: pitchAccent?.pattern,
        reading: curatedEntry?.reading || candidate?.pron,
    });
}

function buildWordNotes(curatedEntry) {
    return String(curatedEntry?.notes || "").trim();
}

async function resolveWordAudioReference({ candidate, focusKanji, audioService }) {
    if (!audioService) {
        return {
            audioField: "",
            mediaRefs: [],
        };
    }

    const { kanji, asset } = await findManagedWordAudioAsset({
        written: candidate?.written,
        reading: candidate?.pron,
        focusKanji,
        audioService,
    });

    if (!asset?.path || !kanji) {
        return {
            audioField: "",
            mediaRefs: [],
        };
    }

    return {
        audioField: formatAnkiAudioField(asset.path),
        mediaRefs: [{
            kind: "audio",
            kanji,
            relativePath: asset.path,
        }],
    };
}

function summarizeCoverageRole(entry, jlptWordLevelContract) {
    const explicitRole = String(entry?.curatedEntry?.coverage?.role || "").trim().toLowerCase();
    if (explicitRole === "both" || explicitRole === "core") {
        return "JLPT core + reading coverage";
    }
    if (explicitRole === "support") {
        return "Reading coverage support";
    }

    const classification = classifyWordDeckEntry({
        candidate: entry?.candidate,
        curatedEntry: entry?.curatedEntry,
        jlptWordLevelContract,
    });

    if (classification === "canonical") {
        return "JLPT core + reading coverage";
    }
    if (classification === "curatedOnly") {
        return "Reading coverage support";
    }
    return "Inferred support word";
}

function buildJlptLabel(level) {
    return Number.isInteger(level) ? `JLPT N${level}` : "";
}

function classifyWordDeckEntry({ candidate, curatedEntry, jlptWordLevelContract }) {
    const canonicalLevel = getCanonicalWordLevel({
        candidate: curatedEntry || candidate,
        jlptWordLevelContract,
    });
    if (Number.isInteger(canonicalLevel)) {
        return "canonical";
    }
    if (curatedEntry) {
        return "curatedOnly";
    }
    return "inferredOnly";
}

function pickBestExactSingleCandidate(inference, sourceKanji) {
    const exactMatches = (Array.isArray(inference?.candidates) ? inference.candidates : [])
        .filter((candidate) => candidate?.written === sourceKanji);

    if (exactMatches.length === 0) {
        return null;
    }

    return [...exactMatches].sort((a, b) => {
        const aReadable = KATAKANA_ONLY_RE.test(String(a?.pron || "")) ? 0 : 1;
        const bReadable = KATAKANA_ONLY_RE.test(String(b?.pron || "")) ? 0 : 1;
        if (bReadable !== aReadable) {
            return bReadable - aReadable;
        }
        return (b.score || 0) - (a.score || 0);
    })[0];
}

function extractEnglishMeaningFromMeaningJP(meaningJP) {
    const text = String(meaningJP || "").trim();
    if (!text) {
        return "";
    }

    const parts = text.split("／").map((part) => part.trim()).filter(Boolean);
    return parts.length > 1 ? parts[parts.length - 1] : text;
}

function buildDisplayCandidate(inference, sourceKanji) {
    const written = String(sourceKanji || "").trim();
    if (!written) {
        return null;
    }

    const exactCandidate = pickBestExactSingleCandidate(inference, sourceKanji);
    const pron = String(exactCandidate?.pron || inference?.primaryReading || inference?.displayWord?.pron || "").trim();
    const gloss = String(exactCandidate?.gloss || inference?.englishMeaning || extractEnglishMeaningFromMeaningJP(inference?.meaningJP) || "").trim();

    return {
        written,
        pron,
        gloss,
        score: Number.MAX_SAFE_INTEGER - 1,
        corpusSupportScore: Number.MAX_SAFE_INTEGER - 1,
        variant: { priorities: ["display-word"] },
    };
}

function buildWordStudyIndexes(wordStudyData = {}) {
    const exactEntries = new Map();
    const entriesByWritten = new Map();
    const entriesByKanji = new Map();

    for (const entry of Object.values(wordStudyData || {})) {
        if (hasExcludedWordCardTag(entry)) {
            continue;
        }

        const key = buildWordStudyEntryKey(entry);
        exactEntries.set(key, entry);

        const written = String(entry?.written || "").trim();
        if (!entriesByWritten.has(written)) {
            entriesByWritten.set(written, []);
        }
        entriesByWritten.get(written).push(entry);

        for (const kanji of extractConstituentKanji(written)) {
            if (!entriesByKanji.has(kanji)) {
                entriesByKanji.set(kanji, []);
            }
            entriesByKanji.get(kanji).push(entry);
        }
    }

    return {
        exactEntries,
        entriesByWritten,
        entriesByKanji,
    };
}

function buildCuratedCandidate(entry) {
    return {
        written: entry.written,
        pron: entry.reading,
        gloss: entry.meaning,
        score: Number.MAX_SAFE_INTEGER,
        corpusSupportScore: Number.MAX_SAFE_INTEGER,
        variant: { priorities: ["curated-word"] },
    };
}

function getCandidateLevel({ candidate, curatedEntry, jlptOnlyJson, jlptWordLevelContract, fallbackLevel }) {
    const canonicalLevel = getCanonicalWordLevel({
        candidate: curatedEntry || candidate,
        jlptWordLevelContract,
    });
    if (Number.isInteger(canonicalLevel)) {
        return canonicalLevel;
    }

    if (Number.isInteger(curatedEntry?.jlpt)) {
        return curatedEntry.jlpt;
    }

    return inferWordLevel({
        written: candidate?.written,
        jlptOnlyJson,
        fallbackLevel,
    });
}

function getTrustedCandidateLevel({ candidate, curatedEntry, jlptWordLevelContract }) {
    const canonicalLevel = getCanonicalWordLevel({
        candidate: curatedEntry || candidate,
        jlptWordLevelContract,
    });
    if (Number.isInteger(canonicalLevel)) {
        return canonicalLevel;
    }

    if (Number.isInteger(curatedEntry?.jlpt)) {
        return curatedEntry.jlpt;
    }

    return null;
}

function isStandaloneKanjiOutsideDeckLevel({ candidate, levelNumber, jlptOnlyJson }) {
    const written = String(candidate?.written || "");
    const chars = Array.from(written);

    if (chars.length !== 1) {
        return false;
    }

    const kanji = chars[0];
    const kanjiLevel = jlptOnlyJson?.[kanji]?.jlpt ?? null;

    if (!Number.isInteger(kanjiLevel)) {
        return true;
    }

    return kanjiLevel !== levelNumber;
}

function hasCuratedWrittenVariant(candidate, wordStudyIndexes) {
    const written = String(candidate?.written || "").trim();
    return (wordStudyIndexes.entriesByWritten.get(written) || []).length > 0;
}

function isAllowedByCuratedWords(candidate, wordStudyIndexes) {
    if (!hasCuratedWrittenVariant(candidate, wordStudyIndexes)) {
        return true;
    }

    return wordStudyIndexes.exactEntries.has(buildWordKey(candidate));
}

function dedupeCandidatePool(pool) {
    const deduped = new Map();
    for (const candidate of pool) {
        const key = buildWordKey(candidate);
        if (!key || key === "|") {
            continue;
        }

        const existing = deduped.get(key);
        if (!existing || (candidate.score || 0) > (existing.score || 0)) {
            deduped.set(key, candidate);
        }
    }

    return [...deduped.values()];
}

function buildCandidatePool({
    inference,
    sourceKanji,
    maxWordsPerKanji,
    minimumCandidateScore,
    wordStudyIndexes,
    jlptWordLevelContract,
    levelNumber,
    jlptOnlyJson,
    includeInferred = false,
}) {
    const pool = [];
    const curatedCandidates = (wordStudyIndexes.entriesByKanji.get(sourceKanji) || [])
        .filter((entry) => getCandidateLevel({
            candidate: entry,
            curatedEntry: entry,
            jlptOnlyJson,
            jlptWordLevelContract,
            fallbackLevel: levelNumber,
        }) === levelNumber)
        .filter((entry) => {
            if (!isLikelyPhraseCard(entry)) {
                return true;
            }

            return Number.isInteger(getCanonicalWordLevel({
                candidate: entry,
                jlptWordLevelContract,
            }));
        })
        .map(buildCuratedCandidate);

    pool.push(...curatedCandidates);

    if (!includeInferred) {
        return dedupeCandidatePool(pool);
    }

    const displayCandidate = buildDisplayCandidate(inference, sourceKanji);
    if (displayCandidate && !isLikelyPhraseCard(displayCandidate) && isAllowedByCuratedWords(displayCandidate, wordStudyIndexes)) {
        pool.push(displayCandidate);
    }

    const rankedCandidates = (Array.isArray(inference?.candidates) ? inference.candidates : [])
        .filter((candidate) => Number.isFinite(candidate?.score) && candidate.score >= minimumCandidateScore)
        .filter((candidate) => candidate?.written && extractConstituentKanji(candidate.written).length > 0)
        .filter((candidate) => candidate.written.length > 0)
        .filter((candidate) => candidate.written !== sourceKanji)
        .filter((candidate) => (candidate.corpusSupportScore || 0) > 0 || (candidate.variant?.priorities?.length || 0) > 0)
        .filter((candidate) => !isLikelyPhraseCard(candidate))
        .filter((candidate) => isAllowedByCuratedWords(candidate, wordStudyIndexes));

    const scopedCandidates = Number.isFinite(maxWordsPerKanji)
        ? rankedCandidates.slice(0, maxWordsPerKanji)
        : rankedCandidates;

    pool.push(...scopedCandidates);
    return dedupeCandidatePool(pool);
}

function buildWordSupportScore(candidate, sentenceCorpus) {
    const entries = (Array.isArray(sentenceCorpus) ? sentenceCorpus : [])
        .filter((entry) => entry?.written === candidate?.written);

    if (entries.length === 0) {
        return 0;
    }

    let score = 100;
    if (entries.some((entry) => String(entry?.reading || "").trim() === String(candidate?.pron || "").trim())) {
        score += 300;
    }
    if (entries.some((entry) => String(entry?.reading || "").includes(String(candidate?.pron || "")))) {
        score += 100;
    }
    if (entries.some((entry) => String(entry?.japanese || "").includes(candidate?.written || ""))) {
        score += 50;
    }

    return score;
}

function normalizeBreakdownReadingField(value, prefixPattern) {
    const text = String(value || "").trim();
    if (!text) {
        return "";
    }

    return text.replace(prefixPattern, "").trim();
}

function normalizeWordReadingToken(value) {
    return katakanaToHiragana(String(value || ""))
        .replace(/^おん:/, "")
        .replace(/^くん:/, "")
        .replace(/[\s・･]/g, "")
        .replace(/[.\-]/g, "")
        .replace(/…/g, "")
        .trim();
}

function splitReadingList(value) {
    return [...new Set(
        String(value || "")
            .split(/[、,]/u)
            .flatMap((entry) => {
                const normalized = normalizeWordReadingToken(entry);
                const preOkurigana = String(entry || "").includes(".")
                    ? normalizeWordReadingToken(String(entry || "").split(".")[0])
                    : "";
                return [normalized, preOkurigana];
            })
            .filter(Boolean)
    )];
}

function buildReadingSurfaceVariants(reading) {
    const normalized = normalizeWordReadingToken(reading);
    if (!normalized) {
        return [];
    }

    const variants = new Set([normalized]);
    const firstChar = Array.from(normalized)[0] || "";
    const rest = Array.from(normalized).slice(1).join("");
    const rendakuMap = {
        か: ["が"],
        き: ["ぎ"],
        く: ["ぐ"],
        け: ["げ"],
        こ: ["ご"],
        さ: ["ざ"],
        し: ["じ"],
        す: ["ず"],
        せ: ["ぜ"],
        そ: ["ぞ"],
        た: ["だ"],
        ち: ["ぢ", "じ"],
        つ: ["づ", "ず"],
        て: ["で"],
        と: ["ど"],
        は: ["ば", "ぱ"],
        ひ: ["び", "ぴ"],
        ふ: ["ぶ", "ぷ"],
        へ: ["べ", "ぺ"],
        ほ: ["ぼ", "ぽ"],
    };

    for (const voiced of rendakuMap[firstChar] || []) {
        variants.add(`${voiced}${rest}`);
    }

    if (normalized.endsWith("く") || normalized.endsWith("つ")) {
        variants.add(`${normalized.slice(0, -1)}っ`);
    }
    if (normalized.endsWith("ち") && normalized.length > 1) {
        variants.add(normalized.slice(0, -1));
    }

    return [...variants].filter(Boolean);
}

function collectKanjiReadingCandidates({ kanji, inference, curatedEntry = null, coverageReadings = {} }) {
    const readings = [];

    if (coverageReadings?.[kanji]) {
        readings.push(coverageReadings[kanji]);
    }
    if (curatedEntry?.displayWord?.pron && curatedEntry?.displayWord?.written === kanji) {
        readings.push(curatedEntry.displayWord.pron);
    }
    if (curatedEntry?.breakdownDisplayWord?.pron && curatedEntry?.breakdownDisplayWord?.written === kanji) {
        readings.push(curatedEntry.breakdownDisplayWord.pron);
    }
    readings.push(...splitReadingList(normalizeBreakdownReadingField(inference?.onReading, /^(on|オン)\s*:\s*/i)));
    readings.push(...splitReadingList(normalizeBreakdownReadingField(inference?.kunReading, /^(kun|くん)\s*:\s*/i)));
    if (inference?.primaryReading) {
        readings.push(inference.primaryReading);
    }

    return [...new Set(readings.flatMap((reading) => buildReadingSurfaceVariants(reading)))]
        .sort((a, b) => b.length - a.length || a.localeCompare(b));
}

function buildReadingBreakdownUnits(written) {
    return Array.from(String(written || "")).map((char) => ({
        char,
        kind: HAN_CHAR_RE.test(char) || char === "々" ? "kanji" : "literal",
    }));
}

function alignReadingBreakdownUnits({ units, reading, kanjiInferenceCache, curatedStudyData = {}, coverageReadings = {} }) {
    const normalizedReading = normalizeWordReadingToken(reading);
    const memo = new Map();

    function align(unitIndex, readingIndex) {
        const memoKey = `${unitIndex}:${readingIndex}`;
        if (memo.has(memoKey)) {
            return memo.get(memoKey);
        }

        if (unitIndex >= units.length) {
            const result = readingIndex === normalizedReading.length ? [] : null;
            memo.set(memoKey, result);
            return result;
        }

        const unit = units[unitIndex];
        const remaining = normalizedReading.slice(readingIndex);

        if (unit.kind === "literal") {
            const literal = normalizeWordReadingToken(unit.char);
            if (!literal || !remaining.startsWith(literal)) {
                memo.set(memoKey, null);
                return null;
            }
            const rest = align(unitIndex + 1, readingIndex + literal.length);
            const result = rest ? [{ label: "", surface: unit.char, reading: literal, kind: "literal" }, ...rest] : null;
            memo.set(memoKey, result);
            return result;
        }

        const inference = kanjiInferenceCache?.get(unit.char);
        const candidates = collectKanjiReadingCandidates({
            kanji: unit.char,
            inference,
            curatedEntry: curatedStudyData?.[unit.char] || null,
            coverageReadings,
        });

        for (const candidate of candidates) {
            if (!candidate || !remaining.startsWith(candidate)) {
                continue;
            }
            const rest = align(unitIndex + 1, readingIndex + candidate.length);
            if (rest) {
                const result = [{ label: unit.char, surface: unit.char, reading: candidate, kind: "kanji" }, ...rest];
                memo.set(memoKey, result);
                return result;
            }
        }

        memo.set(memoKey, null);
        return null;
    }

    return align(0, 0);
}

function formatRubyChunk(surface, reading) {
    const base = String(surface || "").replace(/\+/g, "").trim();
    const rt = String(reading || "").trim();
    if (!base) {
        return "";
    }
    if (!rt) {
        return escapeHtml(base);
    }
    return `<ruby>${escapeHtml(base)}<rt>${escapeHtml(rt)}</rt></ruby>`;
}

function formatReadingBreakdownSegmentsAsRuby(segments) {
    return (Array.isArray(segments) ? segments : [])
        .map((segment) => {
            const surface = String(segment?.surface || segment?.label || segment?.reading || "");
            if (segment?.kind === "literal") {
                return escapeHtml(surface);
            }
            return formatRubyChunk(surface, segment?.reading || "");
        })
        .join("");
}

function buildWordReadingBreakdown({
    candidate,
    curatedEntry = null,
    kanjiInferenceCache,
    curatedStudyData = {},
}) {
    const curatedBreakdown = String(curatedEntry?.readingBreakdown || "").trim();
    if (curatedBreakdown) {
        if (!curatedBreakdown.includes("<ruby>")) {
            throw new Error(`Curated readingBreakdown for ${candidate?.written || "word"} must use ruby furigana markup`);
        }
        return curatedBreakdown;
    }

    const written = String(candidate?.written || "").trim();
    const reading = String(curatedEntry?.reading || candidate?.pron || "").trim();
    if (!written && !reading) {
        return "";
    }

    const units = buildReadingBreakdownUnits(written);
    const kanjiUnits = units.filter((unit) => unit.kind === "kanji");
    const hasKanaLiteral = units.some((unit) => unit.kind === "literal" && isKanaOnly(unit.char));
    if (kanjiUnits.length === 0) {
        return escapeHtml(reading || written);
    }
    if (kanjiUnits.length < 2 && !hasKanaLiteral) {
        return formatRubyChunk(written, reading);
    }

    const coverageReadings = curatedEntry?.coverage?.coversReadings || {};
    const segments = alignReadingBreakdownUnits({
        units,
        reading,
        kanjiInferenceCache,
        curatedStudyData,
        coverageReadings,
    });

    if (!segments) {
        return formatRubyChunk(written, reading);
    }

    if (segments.length < 2) {
        return formatRubyChunk(written, reading);
    }

    return formatReadingBreakdownSegmentsAsRuby(segments);
}

function extractPrimaryCoverageReading(breakdown = {}) {
    const primary = String(breakdown?.primaryReading || "").trim();
    if (primary) {
        return primary;
    }

    const fallbackReading = String(breakdown?.onReading || breakdown?.kunReading || "").trim();
    if (!fallbackReading) {
        return "";
    }

    return fallbackReading.split("、")[0].trim();
}

function orderFocusKanjiForWord(candidate = {}, sourceKanji = new Set()) {
    const focusSet = sourceKanji instanceof Set ? sourceKanji : new Set(sourceKanji || []);
    const orderedConstituents = extractConstituentKanji(candidate?.written || "");
    const ordered = [];

    for (const kanji of orderedConstituents) {
        if (focusSet.has(kanji) && !ordered.includes(kanji)) {
            ordered.push(kanji);
        }
    }

    for (const kanji of focusSet) {
        if (!ordered.includes(kanji)) {
            ordered.push(kanji);
        }
    }

    return ordered;
}

function buildExplicitCoverageReadings(entry = {}, focusKanji = []) {
    const explicitReadings = entry?.curatedEntry?.coverage?.coversReadings || {};
    if (!explicitReadings || Object.keys(explicitReadings).length === 0) {
        return "";
    }

    return focusKanji
        .map((kanji) => {
            const reading = String(explicitReadings?.[kanji] || "").trim();
            return reading ? `${kanji}: ${reading}` : "";
        })
        .filter(Boolean)
        .join(" ／ ");
}

function buildConstituentLevelLabel({ kanji, deckLevel, jlptOnlyJson }) {
    const actualLevel = Number.isInteger(jlptOnlyJson?.[kanji]?.jlpt)
        ? jlptOnlyJson[kanji].jlpt
        : null;

    if (!actualLevel) {
        return "Outside JLPT contract";
    }

    if (!Number.isInteger(deckLevel) || actualLevel === deckLevel) {
        return "";
    }

    return `JLPT N${actualLevel} kanji`;
}

function resolveCoverageMetadata({ entry, kanjiInferenceCache, curatedStudyData }) {
    const explicitFocusKanji = Array.isArray(entry?.curatedEntry?.coverage?.focusKanji)
        ? entry.curatedEntry.coverage.focusKanji
        : null;
    const focusKanji = explicitFocusKanji && explicitFocusKanji.length > 0
        ? orderFocusKanjiForWord(
            { written: entry?.candidate?.written || "" },
            new Set(explicitFocusKanji),
        )
        : orderFocusKanjiForWord(entry?.candidate, entry?.sourceKanji);

    const explicitCoversReading = buildExplicitCoverageReadings(entry, focusKanji);
    if (explicitCoversReading) {
        return {
            focusKanji,
            coversReading: explicitCoversReading,
        };
    }

    const coversReading = focusKanji
        .map((kanji) => {
            const inference = kanjiInferenceCache.get(kanji);
            if (!inference) {
                return "";
            }

            const breakdown = buildBreakdownInference({
                kanji,
                inference,
                curatedEntry: curatedStudyData?.[kanji] || null,
                contextWord: entry.candidate.written,
                contextCandidate: {
                    written: entry.candidate.written,
                    reading: entry.curatedEntry?.reading || entry.candidate.pron,
                    meaning: entry.curatedEntry?.meaning || entry.candidate.gloss,
                },
            });
            const reading = extractPrimaryCoverageReading(breakdown);
            return reading ? `${kanji}: ${reading}` : kanji;
        })
        .filter(Boolean)
        .join(" ／ ");

    return {
        focusKanji,
        coversReading,
    };
}

function pickPreferredCandidate(existingCandidate, incomingCandidate, sentenceCorpus) {
    const existingSupport = buildWordSupportScore(existingCandidate, sentenceCorpus);
    const incomingSupport = buildWordSupportScore(incomingCandidate, sentenceCorpus);

    if (incomingSupport !== existingSupport) {
        return incomingSupport > existingSupport ? incomingCandidate : existingCandidate;
    }
    if ((incomingCandidate?.corpusSupportScore || 0) !== (existingCandidate?.corpusSupportScore || 0)) {
        return (incomingCandidate?.corpusSupportScore || 0) > (existingCandidate?.corpusSupportScore || 0)
            ? incomingCandidate
            : existingCandidate;
    }
    if ((incomingCandidate?.score || 0) !== (existingCandidate?.score || 0)) {
        return (incomingCandidate?.score || 0) > (existingCandidate?.score || 0)
            ? incomingCandidate
            : existingCandidate;
    }
    return String(incomingCandidate?.pron || "").length < String(existingCandidate?.pron || "").length
        ? incomingCandidate
        : existingCandidate;
}

function selectWordSentence({ candidate, curatedEntry, sourceKanji, constituentKanji, sentenceCorpus }) {
    if (curatedEntry?.exampleSentence) {
        return {
            japanese: curatedEntry.exampleSentence.japanese,
            reading: curatedEntry.exampleSentence.reading || candidate.pron,
            english: curatedEntry.exampleSentence.english,
        };
    }

    const wordEntries = (Array.isArray(sentenceCorpus) ? sentenceCorpus : [])
        .filter((entry) => entry?.written === candidate?.written);

    if (wordEntries.length > 0) {
        const targetKanji = sourceKanji || constituentKanji[0] || "";
        const bestEntry = [...wordEntries].sort((a, b) => {
            const aExactPronMatch = String(a?.reading || "").trim() === String(candidate?.pron || "").trim() ? 1 : 0;
            const bExactPronMatch = String(b?.reading || "").trim() === String(candidate?.pron || "").trim() ? 1 : 0;
            if (bExactPronMatch !== aExactPronMatch) {
                return bExactPronMatch - aExactPronMatch;
            }

            const aPronMatch = String(a?.reading || "").includes(String(candidate?.pron || "")) ? 1 : 0;
            const bPronMatch = String(b?.reading || "").includes(String(candidate?.pron || "")) ? 1 : 0;
            if (bPronMatch !== aPronMatch) {
                return bPronMatch - aPronMatch;
            }
            return scoreCorpusSentence(b, candidate, targetKanji) - scoreCorpusSentence(a, candidate, targetKanji);
        })[0];

        return {
            japanese: bestEntry.japanese,
            reading: bestEntry.reading || candidate.pron,
            english: bestEntry.english,
        };
    }

    const inferred = inferSentenceCandidates({
        rankedCandidates: [candidate],
        kanji: sourceKanji || constituentKanji[0] || "",
        sentenceCorpus,
        maxSentences: 1,
    })[0];

    return inferred ? {
        japanese: inferred.japanese,
        reading: inferred.reading,
        english: inferred.english,
    } : null;
}

function buildBreakdownInference({ kanji, inference, curatedEntry = null, contextWord = "", contextCandidate = null }) {
    const exactCandidate = pickBestExactSingleCandidate(inference, kanji);
    const exactPron = String(exactCandidate?.pron || "").trim();
    const inferredPrimaryReading = String(inference?.primaryReading || "").trim();
    const constituentCount = extractConstituentKanji(contextWord).length;
    const isSingleKanjiWordContext = constituentCount === 1
        && extractConstituentKanji(String(contextCandidate?.written || "")).length === 1
        && String(contextCandidate?.written || "").includes(kanji);
    const useBreakdownOverrides = constituentCount > 1;
    const contextDisplayWord = isSingleKanjiWordContext
        ? {
            written: String(contextCandidate?.written || "").trim(),
            pron: String(contextCandidate?.reading || contextCandidate?.pron || "").trim(),
        }
        : null;
    const contextOverride = (Array.isArray(curatedEntry?.breakdownOverrides) ? curatedEntry.breakdownOverrides : []).find((override) => {
        const matchWord = String(override?.matchWord || "").trim();
        return matchWord
            && (matchWord === String(contextWord || "").trim()
                || matchWord === String(contextCandidate?.written || "").trim());
    }) || null;
    const breakdownOverrideDisplayWord = contextOverride?.displayWord?.written
        ? {
            written: String(contextOverride.displayWord.written || "").trim(),
            pron: String(contextOverride?.displayWord?.pron || "").trim(),
        }
        : (curatedEntry?.breakdownDisplayWord?.written
            ? {
                written: String(curatedEntry.breakdownDisplayWord.written || "").trim(),
                pron: String(curatedEntry?.breakdownDisplayWord?.pron || "").trim(),
            }
            : null);
    const breakdownOverrideMatchesContext = Boolean(breakdownOverrideDisplayWord)
        && (breakdownOverrideDisplayWord.written === kanji
            || breakdownOverrideDisplayWord.written === String(contextWord || "").trim()
            || breakdownOverrideDisplayWord.written === String(contextCandidate?.written || "").trim());
    const defaultCuratedDisplayWord = curatedEntry?.displayWord?.written
        ? {
            written: String(curatedEntry.displayWord.written || "").trim(),
            pron: String(curatedEntry?.displayWord?.pron || "").trim(),
        }
        : null;
    const defaultCuratedDisplayWordKanji = defaultCuratedDisplayWord
        ? extractConstituentKanji(defaultCuratedDisplayWord.written)
        : [];
    const defaultCuratedDisplayWordAllowed = Boolean(defaultCuratedDisplayWord)
        && (!useBreakdownOverrides
            || defaultCuratedDisplayWord.written === kanji
            || (defaultCuratedDisplayWordKanji.length === 1 && defaultCuratedDisplayWordKanji[0] === kanji));
    const curatedDisplayWord = (useBreakdownOverrides && breakdownOverrideMatchesContext
        ? breakdownOverrideDisplayWord
        : (defaultCuratedDisplayWordAllowed ? defaultCuratedDisplayWord : null));
    const useExactCandidate = !contextDisplayWord
        && !curatedDisplayWord
        && exactCandidate?.written === kanji
        && exactPron
        && !KATAKANA_ONLY_RE.test(exactPron)
        && exactPron === inferredPrimaryReading;
    const displayWord = contextDisplayWord || curatedDisplayWord || (useExactCandidate
        ? { written: kanji, pron: exactPron }
        : { written: kanji, pron: "" });
    const englishMeaning = String(
        ((useBreakdownOverrides && contextOverride?.englishMeaning) ? contextOverride.englishMeaning : "")
        || ((useBreakdownOverrides && breakdownOverrideMatchesContext) ? curatedEntry?.breakdownEnglishMeaning : "")
        || (isSingleKanjiWordContext ? contextCandidate?.meaning || contextCandidate?.gloss || "" : "")
        || curatedEntry?.englishMeaning
        || inference?.englishMeaning
        || extractEnglishMeaningFromMeaningJP(inference?.meaningJP)
        || ""
    ).trim();

    return {
        primaryReading: contextDisplayWord?.pron || curatedDisplayWord?.pron || (useExactCandidate ? exactPron : ""),
        meaningJP: buildMeaningJP(displayWord, englishMeaning),
        onReading: normalizeBreakdownReadingField(inference?.onReading, /^(on|オン)\s*:\s*/i),
        kunReading: normalizeBreakdownReadingField(inference?.kunReading, /^(kun|くん)\s*:\s*/i),
        strokeOrderField: inference?.strokeOrderField || "",
        strokeOrderImageField: inference?.strokeOrderImageField || "",
        strokeOrderAnimationField: inference?.strokeOrderAnimationField || "",
    };
}

function buildBreakdownHtmlItem({ kanji, inference, curatedEntry = null, contextWord = "", contextCandidate = null }) {
    const breakdown = buildBreakdownInference({ kanji, inference, curatedEntry, contextWord, contextCandidate });
    const levelLabel = buildConstituentLevelLabel({
        kanji,
        deckLevel: contextCandidate?.deckLevel,
        jlptOnlyJson: contextCandidate?.jlptOnlyJson,
    });
    const readingLines = [
        breakdown.onReading ? `<div class="kanji-reading-line"><span class="kanji-reading-label">On:</span> ${breakdown.onReading}</div>` : "",
        breakdown.kunReading ? `<div class="kanji-reading-line"><span class="kanji-reading-label">Kun:</span> ${breakdown.kunReading}</div>` : "",
    ].filter(Boolean).join("");
    const strokeOrderMarkup = breakdown.strokeOrderAnimationField
        || breakdown.strokeOrderField
        || breakdown.strokeOrderImageField
        || "";

    return [
        '<div class="kanji-breakdown-item">',
        '<div class="kanji-breakdown-head">',
        '<div class="kanji-breakdown-title">',
        `<span class="kanji-char">${kanji}</span>`,
        levelLabel ? `<span class="kanji-level-badge">${levelLabel}</span>` : "",
        "</div>",
        breakdown.primaryReading ? `<span class="kanji-primary">${breakdown.primaryReading}</span>` : "",
        "</div>",
        breakdown.meaningJP ? `<div class="kanji-meaning">${breakdown.meaningJP}</div>` : "",
        strokeOrderMarkup ? `<div class="kanji-stroke-order"><div class="kanji-stroke-order-label">Stroke order</div>${strokeOrderMarkup}</div>` : "",
        readingLines,
        "</div>",
    ].join("");
}

function createWordExportService({
    sentenceCorpus = [],
    curatedStudyData = {},
    wordStudyData = {},
    wordPitchAccentData = {},
    inferenceEngine = createInferenceEngine({ sentenceCorpus, curatedStudyData }),
    kanjiExportService = createExportService({ inferenceEngine }),
} = {}) {
    const wordStudyIndexes = buildWordStudyIndexes(wordStudyData);

    function buildWordDeckGovernanceSummary(entries, jlptWordLevelContract) {
        const counts = {
            canonical: 0,
            curatedOnly: 0,
            inferredOnly: 0,
        };

        for (const entry of entries) {
            counts[classifyWordDeckEntry({
                candidate: entry?.candidate,
                curatedEntry: entry?.curatedEntry,
                jlptWordLevelContract,
            })] += 1;
        }

        return {
            rowCount: entries.length,
            canonicalRows: counts.canonical,
            curatedOnlyRows: counts.curatedOnly,
            inferredOnlyRows: counts.inferredOnly,
        };
    }

    async function buildOfflineKanjiInference({ kanji, jlptEntry, strokeOrderService, audioService }) {
        const fallbackCard = await buildOfflineFallbackCard({
            kanji,
            levelLabel: `N${jlptEntry?.jlpt || "?"}`,
            jlptEntry,
            curatedStudyData,
            sentenceCorpus,
            kradMap: new Map(),
            strokeOrderService,
            audioService,
        });

        return {
            candidates: [],
            displayWord: {
                written: fallbackCard.displayWord,
                pron: fallbackCard.primaryReading,
            },
            primaryReading: fallbackCard.primaryReading,
            englishMeaning: extractEnglishMeaningFromMeaningJP(fallbackCard.meaningJP),
            meaningJP: fallbackCard.meaningJP,
            notes: fallbackCard.notes,
            sentenceCandidates: [],
            onReading: fallbackCard.onReading,
            kunReading: fallbackCard.kunReading,
            strokeOrderPath: fallbackCard.media.strokeOrderPath,
            strokeOrderField: fallbackCard.fields?.strokeOrderField
                || formatAnkiStrokeOrderField(fallbackCard.media.strokeOrderPath),
            strokeOrderImagePath: fallbackCard.media.strokeOrderImagePath,
            strokeOrderImageField: fallbackCard.fields?.strokeOrderImageField
                || formatAnkiStrokeOrderField(fallbackCard.media.strokeOrderImagePath),
            strokeOrderAnimationPath: fallbackCard.media.strokeOrderAnimationPath,
            strokeOrderAnimationField: fallbackCard.fields?.strokeOrderAnimationField
                || formatAnkiStrokeOrderField(fallbackCard.media.strokeOrderAnimationPath),
            audioPath: fallbackCard.media.audioPath,
            audioField: fallbackCard.fields?.audioField
                || formatAnkiAudioField(fallbackCard.media.audioPath),
        };
    }

    async function buildKanjiInferenceCache({ kanjiList, jlptOnlyJson, kanjiApiClient, strokeOrderService, audioService, concurrency = 8 }) {
        const cache = new Map();
        const inferredCards = await mapWithConcurrency(
            [...new Set((Array.isArray(kanjiList) ? kanjiList : []).filter(Boolean))],
            concurrency,
            async (kanji) => {
                try {
                    return {
                        kanji,
                        inference: await kanjiExportService.buildInferenceForKanji({
                            kanji,
                            kanjiApiClient,
                            strokeOrderService,
                            audioService,
                        }),
                    };
                } catch {
                    return {
                        kanji,
                        inference: await buildOfflineKanjiInference({
                            kanji,
                            jlptEntry: jlptOnlyJson?.[kanji] || {},
                            strokeOrderService,
                            audioService,
                        }),
                    };
                }
            }
        );

        for (const entry of inferredCards) {
            cache.set(entry.kanji, entry.inference);
        }

        return cache;
    }

    async function buildWordDeckForLevel({
        levelNumber,
        jlptOnlyJson,
        jlptWordLevelContract = null,
        kanjiApiClient,
        strokeOrderService = null,
        audioService = null,
        limit = null,
        concurrency = 8,
        maxWordsPerKanji = null,
        minimumCandidateScore = 20,
        includeInferred = false,
    }) {
        const sourceKanjiList = Object.entries(jlptOnlyJson || {})
            .filter(([, value]) => value?.jlpt === levelNumber)
            .map(([kanji]) => kanji);
        const scopedSourceKanji = Number.isFinite(limit)
            ? sourceKanjiList.slice(0, limit)
            : sourceKanjiList;
        const kanjiInferenceCache = await buildKanjiInferenceCache({
            kanjiList: scopedSourceKanji,
            jlptOnlyJson,
            kanjiApiClient,
            strokeOrderService,
            audioService,
            concurrency,
        });
        const wordCandidates = new Map();

        for (const sourceKanji of scopedSourceKanji) {
            const inference = kanjiInferenceCache.get(sourceKanji);
            if (!inference) {
                continue;
            }

            const candidatePool = buildCandidatePool({
                inference,
                sourceKanji,
                maxWordsPerKanji,
                minimumCandidateScore,
                wordStudyIndexes,
                jlptWordLevelContract,
                levelNumber,
                jlptOnlyJson,
                includeInferred,
            });

            for (const candidate of candidatePool) {
                const curatedEntry = wordStudyIndexes.exactEntries.get(buildWordKey(candidate)) || null;
                const assignedLevel = getCandidateLevel({
                    candidate,
                    curatedEntry,
                    jlptOnlyJson,
                    jlptWordLevelContract,
                    fallbackLevel: levelNumber,
                });

                if (assignedLevel !== levelNumber) {
                    continue;
                }

                if (isStandaloneKanjiOutsideDeckLevel({ candidate, levelNumber, jlptOnlyJson })) {
                    continue;
                }

                const key = buildWordKey(candidate);
                const existing = wordCandidates.get(key);
                if (!existing) {
                    wordCandidates.set(key, {
                        candidate,
                        curatedEntry,
                        level: assignedLevel,
                        sourceKanji: new Set([sourceKanji]),
                    });
                    continue;
                }

                const preferredCandidate = pickPreferredCandidate(existing.candidate, candidate, sentenceCorpus);
                if (preferredCandidate !== existing.candidate) {
                    existing.candidate = preferredCandidate;
                    existing.curatedEntry = wordStudyIndexes.exactEntries.get(buildWordKey(preferredCandidate)) || null;
                }
                existing.sourceKanji.add(sourceKanji);
            }
        }

        for (const curatedEntry of wordStudyIndexes.exactEntries.values()) {
            const candidate = buildCuratedCandidate(curatedEntry);
            if (isLikelyPhraseCard(candidate)) {
                continue;
            }
            const assignedLevel = getCandidateLevel({
                candidate,
                curatedEntry,
                jlptOnlyJson,
                jlptWordLevelContract,
                fallbackLevel: levelNumber,
            });

            if (assignedLevel !== levelNumber) {
                continue;
            }

            if (isStandaloneKanjiOutsideDeckLevel({ candidate, levelNumber, jlptOnlyJson })) {
                continue;
            }

            const key = buildWordKey(candidate);
            if (wordCandidates.has(key)) {
                continue;
            }

            wordCandidates.set(key, {
                candidate,
                curatedEntry,
                level: assignedLevel,
                sourceKanji: new Set(extractConstituentKanji(candidate.written)),
            });
        }

        const requiredConstituentKanji = [...new Set(
            [...wordCandidates.values()].flatMap((entry) => extractConstituentKanji(entry.candidate.written))
        )];
        const missingKanji = requiredConstituentKanji.filter((kanji) => !kanjiInferenceCache.has(kanji));
        if (missingKanji.length > 0) {
            const additionalCache = await buildKanjiInferenceCache({
                kanjiList: missingKanji,
                jlptOnlyJson,
                kanjiApiClient,
                strokeOrderService,
                audioService,
                concurrency,
            });
            for (const [kanji, inference] of additionalCache.entries()) {
                kanjiInferenceCache.set(kanji, inference);
            }
        }

        const rows = [];
        const mediaKanji = new Set();
        const mediaRefs = [];
        const sortedEntries = [...wordCandidates.values()].sort(compareWordDeckAuditOrder);
        const studyEntries = sortWordDeckEntriesForStudy(sortedEntries, { levelNumber, jlptOnlyJson });

        for (const entry of studyEntries) {
            const constituentKanji = extractConstituentKanji(entry.candidate.written);
            const breakdownHtml = constituentKanji
                .map((kanji) => {
                    mediaKanji.add(kanji);
                    const inference = kanjiInferenceCache.get(kanji);
                    if (!inference) {
                        return "";
                    }
                    return buildBreakdownHtmlItem({
                        kanji,
                        inference,
                        curatedEntry: curatedStudyData?.[kanji] || null,
                        contextWord: entry.candidate.written,
                        contextCandidate: {
                            written: entry.candidate.written,
                            reading: entry.curatedEntry?.reading || entry.candidate.pron,
                            meaning: entry.curatedEntry?.meaning || entry.candidate.gloss,
                            deckLevel: levelNumber,
                            jlptOnlyJson,
                        },
                    });
                })
                .filter(Boolean)
                .join("");
            const coverageMetadata = resolveCoverageMetadata({
                entry,
                kanjiInferenceCache,
                curatedStudyData,
            });
            const exampleSentence = formatExampleSentence(selectWordSentence({
                candidate: entry.candidate,
                curatedEntry: entry.curatedEntry,
                sourceKanji: coverageMetadata.focusKanji[0] || "",
                constituentKanji,
                sentenceCorpus,
            }));
            const wordAudio = await resolveWordAudioReference({
                candidate: {
                    written: entry.candidate.written,
                    pron: entry.curatedEntry?.reading || entry.candidate.pron,
                },
                focusKanji: coverageMetadata.focusKanji,
                audioService,
            });
            const trustedLevel = getTrustedCandidateLevel({
                candidate: entry.candidate,
                curatedEntry: entry.curatedEntry,
                jlptWordLevelContract,
            });
            mediaRefs.push(...wordAudio.mediaRefs);
            const readingBreakdown = buildWordReadingBreakdown({
                candidate: entry.candidate,
                curatedEntry: entry.curatedEntry,
                kanjiInferenceCache,
                curatedStudyData,
            });

            rows.push([
                entry.candidate.written,
                entry.curatedEntry?.reading || entry.candidate.pron,
                readingBreakdown,
                wordAudio.audioField,
                formatPitchAccent({
                    candidate: entry.candidate,
                    curatedEntry: entry.curatedEntry,
                    wordPitchAccentData,
                }),
                entry.curatedEntry?.meaning || entry.candidate.gloss,
                buildJlptLabel(trustedLevel),
                summarizeCoverageRole(entry, jlptWordLevelContract),
                coverageMetadata.focusKanji.join("、"),
                coverageMetadata.coversReading,
                breakdownHtml,
                exampleSentence,
                buildWordNotes(entry.curatedEntry),
            ].map(tsvEscape).join("\t"));
        }

        return {
            header: WORD_FIELD_NAMES.join("\t"),
            rows,
            mediaKanji: [...mediaKanji].sort(),
            mediaRefs,
            governance: buildWordDeckGovernanceSummary(sortedEntries, jlptWordLevelContract),
            studyOrder: {
                seed: DEFAULT_WORD_DECK_ORDER_SEED,
                strategy: "deterministic-interleaved-shuffle",
            },
        };
    }

    async function buildWordTsvForJlptLevel(options) {
        const result = await buildWordDeckForLevel(options);
        return {
            tsv: [result.header, ...result.rows].join("\n"),
            mediaKanji: result.mediaKanji,
            mediaRefs: result.mediaRefs,
            rowCount: result.rows.length,
            governance: result.governance,
            studyOrder: result.studyOrder,
        };
    }

    return {
        buildBreakdownInference,
        buildWordDeckForLevel,
        buildWordTsvForJlptLevel,
        buildCandidatePool,
        classifyWordDeckEntry,
        buildWordKey,
        buildWordNotes,
        buildWordReadingBreakdown,
        inferWordLevel,
        getTrustedCandidateLevel,
        isStandaloneKanjiOutsideDeckLevel,
        extractConstituentKanji,
        pickPreferredCandidate,
        selectWordSentence,
        sortWordDeckEntriesForStudy,
    };
}

const defaultWordExportService = createWordExportService();

module.exports = {
    buildBreakdownInference,
    buildCandidatePool,
    classifyWordDeckEntry,
    buildDisplayCandidate,
    buildJlptLabel,
    buildWordKey,
    buildWordNotes,
    buildWordReadingBreakdown,
    buildWordStudyIndexes,
    buildWordSupportScore,
    compareWordDeckAuditOrder,
    createWordExportService,
    defaultWordExportService,
    extractConstituentKanji,
    getCanonicalWordLevel,
    getTrustedCandidateLevel,
    getWordDeckCurriculumScore,
    getWordDeckCurriculumTier,
    getWordDeckStudyGroupKey,
    hasExcludedWordCardTag,
    inferWordLevel,
    isStandaloneKanjiOutsideDeckLevel,
    isLikelyPhraseCard,
    isAllowedByCuratedWords,
    extractPrimaryCoverageReading,
    orderFocusKanjiForWord,
    resolveCoverageMetadata,
    normalizeBreakdownReadingField,
    pickBestExactSingleCandidate,
    pickPreferredCandidate,
    selectWordSentence,
    sortWordDeckEntriesForStudy,
};

