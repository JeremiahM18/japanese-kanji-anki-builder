const { classifyGloss } = require("./candidateExtractor");
const {
    scoreFrequencyRank,
    scoreJlpt,
    scoreRegister,
    scoreSource,
    scoreTags,
} = require("./sentenceInference");
const { normalizeText } = require("../utils/text");

const INVALID_SCORE = -999;

const SCORE = {
    CONTAINS_TARGET_KANJI: 20,
    MISSING_TARGET_KANJI: -25,
    LENGTH_1: 8,
    LENGTH_2: 18,
    LENGTH_3: 12,
    LENGTH_4: 6,
    LENGTH_OVER_4_CAP: -12,
    PRIORITY_MARKER: 5,
    SHORT_GLOSS: 6,
    LONG_GLOSS: -6,
    NAME_PENALTY: -20,
    OBSCURE_PENALTY: -25,
    ASCII_WRITTEN_PENALTY: -20,
    PARENS_NOISE_PENALTY: -8,
    GOOD_KANJI_FOOTPRINT: 5,
    TOO_MANY_KANJI_PENALTY: -6,
    KANA_ONLY_PENALTY: -10,
    CORE_MEANING_BONUS: 12,
    SEXAGENARY_PENALTY: -40,
    SPECIES_PENALTY: -30,
    LONG_PRONUNCIATION_PENALTY: -4,
    EXACT_MATCH_BONUS: 10,
    EXACT_MATCH_CORE_MEANING_BONUS: 14,
    EXACT_MATCH_OBSCURE_PENALTY: -20,
    SINGLE_KANJI_KATAKANA_PENALTY: -25,
    CORPUS_EXACT_WRITTEN_BONUS: 16,
    CORPUS_TARGET_KANJI_BONUS: 8,
    CORPUS_JAPANESE_MATCH_BONUS: 6,
    CORPUS_SUPPORT_CAP: 45,
};

const KATAKANA_ONLY_RE = /^[\p{Script=Katakana}ー]+$/u;
const KANA_ONLY_RE = /^[\p{Script=Hiragana}\p{Script=Katakana}ー]+$/u;
const HAN_CHAR_RE = /\p{Script=Han}/u;
const ASCII_ALNUM_RE = /^[A-Za-z0-9]+$/;
const JAPANESE_PARENS_NOISE_RE = /[(（].+[)）]/;

function countKanjiChars(text) {
    return Array.from(String(text ?? "")).filter((ch) => HAN_CHAR_RE.test(ch)).length;
}

function hasKanaOnly(text) {
    return KANA_ONLY_RE.test(String(text ?? ""));
}

function hasJapaneseParensNoise(text) {
    return JAPANESE_PARENS_NOISE_RE.test(String(text ?? ""));
}

function glossMatchesCoreMeaning(gloss, meanings) {
    const normalizedGloss = normalizeText(gloss);
    const normalizedMeanings = Array.isArray(meanings)
        ? meanings.map((meaning) => normalizeText(meaning)).filter(Boolean)
        : [];

    return normalizedMeanings.some(
        (meaning) => normalizedGloss.includes(meaning) || meaning.includes(normalizedGloss)
    );
}

function compareRankedCandidates(a, b) {
    if (b.score !== a.score) {
        return b.score - a.score;
    }
    if ((b.corpusSupportScore || 0) !== (a.corpusSupportScore || 0)) {
        return (b.corpusSupportScore || 0) - (a.corpusSupportScore || 0);
    }
    if (a.written.length !== b.written.length) {
        return a.written.length - b.written.length;
    }
    if (a.pron.length !== b.pron.length) {
        return a.pron.length - b.pron.length;
    }
    return a.text.localeCompare(b.text);
}

function createBreakdown() {
    return {
        heuristic: [],
        corpusSupport: [],
        totals: {
            heuristicScore: 0,
            corpusSupportScore: 0,
            finalScore: 0,
        },
    };
}

function addContribution(section, breakdown, key, value) {
    breakdown[section].push({ key, value });
    if (section === "heuristic") {
        breakdown.totals.heuristicScore += value;
    }
    if (section === "corpusSupport") {
        breakdown.totals.corpusSupportScore += value;
    }
}

function finalizeBreakdown(breakdown) {
    breakdown.totals.finalScore = breakdown.totals.heuristicScore + breakdown.totals.corpusSupportScore;
    return breakdown;
}

function scoreCorpusSupportEntry(entry, candidate, targetKanji) {
    let score = 0;
    const breakdown = [];

    if (entry.written === candidate.written) {
        score += SCORE.CORPUS_EXACT_WRITTEN_BONUS;
        breakdown.push({ key: "corpus_exact_written_bonus", value: SCORE.CORPUS_EXACT_WRITTEN_BONUS });
    }
    if (entry.kanji === targetKanji) {
        score += SCORE.CORPUS_TARGET_KANJI_BONUS;
        breakdown.push({ key: "corpus_target_kanji_bonus", value: SCORE.CORPUS_TARGET_KANJI_BONUS });
    }
    if (String(entry.japanese || "").includes(candidate.written)) {
        score += SCORE.CORPUS_JAPANESE_MATCH_BONUS;
        breakdown.push({ key: "corpus_japanese_match_bonus", value: SCORE.CORPUS_JAPANESE_MATCH_BONUS });
    }

    const sourceScore = scoreSource(entry);
    score += sourceScore;
    breakdown.push({ key: "corpus_source_score", value: sourceScore });

    const tagScore = scoreTags(entry.tags);
    score += tagScore;
    breakdown.push({ key: "corpus_tag_score", value: tagScore });

    const registerScore = scoreRegister(entry.register);
    score += registerScore;
    breakdown.push({ key: "corpus_register_score", value: registerScore });

    const frequencyScore = scoreFrequencyRank(entry.frequencyRank);
    score += frequencyScore;
    breakdown.push({ key: "corpus_frequency_score", value: frequencyScore });

    const jlptScore = scoreJlpt(entry.jlpt, targetKanji);
    score += jlptScore;
    breakdown.push({ key: "corpus_jlpt_score", value: jlptScore });

    return {
        score,
        breakdown,
    };
}

function scoreCorpusSupport(candidate, targetKanji, sentenceCorpus = []) {
    if (!Array.isArray(sentenceCorpus) || sentenceCorpus.length === 0) {
        return {
            score: 0,
            breakdown: [],
        };
    }

    let best = {
        score: 0,
        breakdown: [],
    };

    for (const entry of sentenceCorpus) {
        const exactWrittenMatch = entry?.written === candidate.written;
        const sentenceContainsWord = String(entry?.japanese || "").includes(candidate.written);

        if (!exactWrittenMatch && !sentenceContainsWord) {
            continue;
        }

        const scored = scoreCorpusSupportEntry(entry, candidate, targetKanji);
        if (scored.score > best.score) {
            best = scored;
        }
    }

    if (best.score > SCORE.CORPUS_SUPPORT_CAP) {
        return {
            score: SCORE.CORPUS_SUPPORT_CAP,
            breakdown: [
                ...best.breakdown,
                {
                    key: "corpus_support_cap",
                    value: SCORE.CORPUS_SUPPORT_CAP - best.score,
                },
            ],
        };
    }

    return best;
}

function scoreCandidate(candidate, targetKanji, kanjiMeanings, sentenceCorpus = []) {
    if (!candidate?.written || !candidate?.pron || !candidate?.gloss) {
        return {
            score: INVALID_SCORE,
            corpusSupportScore: 0,
            scoreBreakdown: {
                heuristic: [{ key: "invalid_candidate", value: INVALID_SCORE }],
                corpusSupport: [],
                totals: {
                    heuristicScore: INVALID_SCORE,
                    corpusSupportScore: 0,
                    finalScore: INVALID_SCORE,
                },
            },
        };
    }

    const breakdown = createBreakdown();
    const { isName, isObscure } = classifyGloss(candidate.meaning?.glosses);
    const written = candidate.written;
    const pron = candidate.pron;
    const firstGloss = candidate.gloss;
    const allGlossText = candidate.allGlossText || "";

    if (written.includes(targetKanji)) {
        addContribution("heuristic", breakdown, "contains_target_kanji", SCORE.CONTAINS_TARGET_KANJI);
    } else {
        addContribution("heuristic", breakdown, "missing_target_kanji", SCORE.MISSING_TARGET_KANJI);
    }

    const len = written.length;
    if (len === 1) {
        addContribution("heuristic", breakdown, "length_1", SCORE.LENGTH_1);
    } else if (len === 2) {
        addContribution("heuristic", breakdown, "length_2", SCORE.LENGTH_2);
    } else if (len === 3) {
        addContribution("heuristic", breakdown, "length_3", SCORE.LENGTH_3);
    } else if (len === 4) {
        addContribution("heuristic", breakdown, "length_4", SCORE.LENGTH_4);
    } else {
        addContribution("heuristic", breakdown, "length_over_4", Math.max(SCORE.LENGTH_OVER_4_CAP, -(len - 4)));
    }

    if (Array.isArray(candidate.variant?.priorities)) {
        addContribution(
            "heuristic",
            breakdown,
            "priority_markers",
            candidate.variant.priorities.length * SCORE.PRIORITY_MARKER
        );
    }

    if (firstGloss.length <= 18) {
        addContribution("heuristic", breakdown, "short_gloss", SCORE.SHORT_GLOSS);
    } else if (firstGloss.length > 40) {
        addContribution("heuristic", breakdown, "long_gloss", SCORE.LONG_GLOSS);
    }

    if (isName) {
        addContribution("heuristic", breakdown, "name_penalty", SCORE.NAME_PENALTY);
    }

    if (isObscure) {
        addContribution("heuristic", breakdown, "obscure_penalty", SCORE.OBSCURE_PENALTY);
    }

    if (ASCII_ALNUM_RE.test(written)) {
        addContribution("heuristic", breakdown, "ascii_written_penalty", SCORE.ASCII_WRITTEN_PENALTY);
    }

    if (hasJapaneseParensNoise(firstGloss)) {
        addContribution("heuristic", breakdown, "parens_noise_penalty", SCORE.PARENS_NOISE_PENALTY);
    }

    const kanjiCount = countKanjiChars(written);
    if (kanjiCount >= 1 && kanjiCount <= 2) {
        addContribution("heuristic", breakdown, "good_kanji_footprint", SCORE.GOOD_KANJI_FOOTPRINT);
    } else if (kanjiCount >= 4) {
        addContribution("heuristic", breakdown, "too_many_kanji_penalty", SCORE.TOO_MANY_KANJI_PENALTY);
    }

    if (hasKanaOnly(written)) {
        addContribution("heuristic", breakdown, "kana_only_penalty", SCORE.KANA_ONLY_PENALTY);
    }

    if (glossMatchesCoreMeaning(firstGloss, kanjiMeanings)) {
        addContribution("heuristic", breakdown, "core_meaning_bonus", SCORE.CORE_MEANING_BONUS);
    }

    if (allGlossText.includes("term of the sexagenary cycle")) {
        addContribution("heuristic", breakdown, "sexagenary_penalty", SCORE.SEXAGENARY_PENALTY);
    }

    if (allGlossText.includes("species of")) {
        addContribution("heuristic", breakdown, "species_penalty", SCORE.SPECIES_PENALTY);
    }

    if (pron.length >= 8) {
        addContribution("heuristic", breakdown, "long_pronunciation_penalty", SCORE.LONG_PRONUNCIATION_PENALTY);
    }

    if (written === targetKanji) {
        addContribution("heuristic", breakdown, "exact_match_bonus", SCORE.EXACT_MATCH_BONUS);

        if (glossMatchesCoreMeaning(firstGloss, kanjiMeanings)) {
            addContribution("heuristic", breakdown, "exact_match_core_meaning_bonus", SCORE.EXACT_MATCH_CORE_MEANING_BONUS);
        }

        if (isObscure) {
            addContribution("heuristic", breakdown, "exact_match_obscure_penalty", SCORE.EXACT_MATCH_OBSCURE_PENALTY);
        }
    }

    if (written === targetKanji && KATAKANA_ONLY_RE.test(pron)) {
        addContribution("heuristic", breakdown, "single_kanji_katakana_penalty", SCORE.SINGLE_KANJI_KATAKANA_PENALTY);
    }

    const corpusSupport = scoreCorpusSupport(candidate, targetKanji, sentenceCorpus);
    for (const contribution of corpusSupport.breakdown) {
        addContribution("corpusSupport", breakdown, contribution.key, contribution.value);
    }

    finalizeBreakdown(breakdown);

    return {
        score: breakdown.totals.finalScore,
        corpusSupportScore: breakdown.totals.corpusSupportScore,
        scoreBreakdown: breakdown,
    };
}

function rankWordCandidates(candidates, targetKanji, kanjiMeanings, sentenceCorpus = []) {
    return [...candidates]
        .map((candidate) => {
            const scored = scoreCandidate(candidate, targetKanji, kanjiMeanings, sentenceCorpus);

            return {
                ...candidate,
                score: scored.score,
                corpusSupportScore: scored.corpusSupportScore,
                scoreBreakdown: scored.scoreBreakdown,
            };
        })
        .sort(compareRankedCandidates);
}

module.exports = {
    INVALID_SCORE,
    SCORE,
    compareRankedCandidates,
    countKanjiChars,
    glossMatchesCoreMeaning,
    rankWordCandidates,
    scoreCandidate,
    scoreCorpusSupport,
    scoreCorpusSupportEntry,
};
