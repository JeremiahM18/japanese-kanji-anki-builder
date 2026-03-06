function tsvEscape(value) {
    return String(value ?? "")
    .replace(/\t/g, " ")
    .replace(/\r?\n/g, " ")
    .trim();
}

function labelReading(onArr, kunArr) {
    const on = Array.isArray(onArr) && onArr.length ? `オン:${onArr.join("、 ")}` : "";
    const kun = Array.isArray(kunArr) && kunArr.length ? `くん:${kunArr.join("、 ")}` : "";
    return [on, kun].filter(Boolean).join(" ／ ");
}

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
};

const KATAKANA_ONLY_RE = /^[\p{Script=Katakana}ー]+$/u;
const KANA_ONLY_RE = /^[\p{Script=Hiragana}\p{Script=Katakana}ー]+$/u;
const HAN_CHAR_RE = /\p{Script=Han}/u;
const ASCII_ALNUM_RE = /^[A-Za-z0-9]+$/;
const JAPANESE_PARENS_NOISE_RE = /[(（].+[)）]/;

function countKanjiChars(text) {
    return Array.from(String(text ?? "")).filter((ch) => HAN_CHAR_RE.test(ch)).length;
}

function glossText(entry) {
    return (entry?.meanings || [])
        .flatMap((m) => Array.isArray(m?.glosses) ? m.glosses : [])
        .map((g) => normalizeText(g))
        .filter(Boolean)
        .join(" ");
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
        ? meanings.map((m) => normalizeText(m)).filter(Boolean)
        : [];

    return normalizedMeanings.some(
        (meaning) => normalizedGloss.includes(meaning) || meaning.includes(normalizedGloss)
    );
}

function normalizeText(value) {
    return String(value ?? "").trim().toLowerCase();
}

function normalizeGlosses(glosses) {
    return (Array.isArray(glosses) ? glosses : [])
        .map((g) => normalizeText(g))
        .filter(Boolean);
}

function classifyGloss(glosses) {
    const g = normalizeGlosses(glosses).join(" ");

    const isName =
        g.includes("surname") ||
        g.includes("given name") ||
        g.includes("place name") ||
        g.includes("person name");

    const isObscure =
        g.includes("chinese zodiac") ||
        g.includes("sexagenary cycle") ||
        g.includes("era name") ||
        g.includes("species of") ||
        g.includes("ancient china") ||
        g.includes("classical") ||
        g.includes("archaism");

    return {
        isName,
        isObscure
    };
}

function pickPrimaryVariant(variants) {
    if (!Array.isArray(variants) || variants.length === 0) {
        return null;
    }

    const ranked = variants
        .filter((variant) => variant?.written && variant?.pronounced)
        .map((variant) => ({
            variant,
            priorityCount: Array.isArray(variant?.priorities) ? variant.priorities.length : 0,
            writtenLength: String(variant.written).length,
            pronouncedLength: String(variant.pronounced).length,
        }));
    
    ranked.sort((a, b) => {
        if (b.priorityCount !== a.priorityCount) {
            return b.priorityCount - a.priorityCount;
        }
        if (a.writtenLength !== b.writtenLength) {
            return a.writtenLength - b.writtenLength;
        }
        if (a.pronouncedLength !== b.pronouncedLength) {
            return a.pronouncedLength - b.pronouncedLength;
        }
        return String(a.variant.written).localeCompare(String(b.variant.written));
    });

    return ranked[0]?.variant || null;
}

function pickPrimaryMeaning(meanings) {
    if (!Array.isArray(meanings) || meanings.length === 0) {
        return null;
    }

    const candidates = meanings.filter(
        (meaning) => Array.isArray(meaning?.glosses) && meaning.glosses.length > 0
    );
    
    return candidates[0] || null;
}

function compareCandidates(a, b) {
    if (b.score !== a.score) {
        return b.score - a.score;
    }
    if (a.written.length !== b.written.length) {
        return a.written.length - b.written.length;
    }
    if (a.pron.length !== b.pron.length) {
        return a.pron.length - b.pron.length;
    }
    return a.text.localeCompare(b.text);
}

function scoreEntry(entry, targetKanji, kanjiMeanings) {
    const variant = pickPrimaryVariant(entry?.variants);
    const meaning = pickPrimaryMeaning(entry?.meanings);

    if (!variant?.written || !variant?.pronounced || !meaning?.glosses?.length) {
        return INVALID_SCORE;
    }

    const written = String(variant.written);
    const pron = String(variant.pronounced);
    const firstGloss = String(meaning.glosses[0] || "");
    const allGlossText = glossText(entry);
    const { isName, isObscure } = classifyGloss(meaning.glosses);

    let score = 0;

    if (written.includes(targetKanji)) {
        score += SCORE.CONTAINS_TARGET_KANJI;
    } else {
        score += SCORE.MISSING_TARGET_KANJI;
    }

    const len = written.length;
    if (len === 1) {
        score += SCORE.LENGTH_1;
    } else if (len === 2) {
        score += SCORE.LENGTH_2;
    } else if (len === 3) {
        score += SCORE.LENGTH_3;
    } else if (len === 4) {
        score += SCORE.LENGTH_4;
    } else {
        score += Math.max(SCORE.LENGTH_OVER_4_CAP, -(len - 4));
    }

    if (Array.isArray(variant.priorities)) {
        score += variant.priorities.length * SCORE.PRIORITY_MARKER;
    }

    if (firstGloss.length <= 18) {
        score += SCORE.SHORT_GLOSS;
    } else if (firstGloss.length > 40) {
        score += SCORE.LONG_GLOSS;
    }

    if (isName) {
        score += SCORE.NAME_PENALTY;
    }

    if (isObscure) {
        score += SCORE.OBSCURE_PENALTY;
    }

    if (ASCII_ALNUM_RE.test(written)) {
        score += SCORE.ASCII_WRITTEN_PENALTY;
    }

    if (hasJapaneseParensNoise(firstGloss)) {
        score += SCORE.PARENS_NOISE_PENALTY;
    }

    const kanjiCount = countKanjiChars(written);
    if (kanjiCount >= 1 && kanjiCount <= 2) {
        score += SCORE.GOOD_KANJI_FOOTPRINT;
    } else if (kanjiCount >= 4) {
        score += SCORE.TOO_MANY_KANJI_PENALTY;
    }

    if (hasKanaOnly(written)) {
        score += SCORE.KANA_ONLY_PENALTY;
    }

    if (glossMatchesCoreMeaning(firstGloss, kanjiMeanings)) {
        score += SCORE.CORE_MEANING_BONUS;
    }

    if (allGlossText.includes("term of the sexagenary cycle")) {
        score += SCORE.SEXAGENARY_PENALTY;
    }

    if (allGlossText.includes("species of")) {
        score += SCORE.SPECIES_PENALTY;
    }

    if (pron.length >= 8) {
        score += SCORE.LONG_PRONUNCIATION_PENALTY;
    }

    if (written === targetKanji) {
        score += SCORE.EXACT_MATCH_BONUS;

        if (glossMatchesCoreMeaning(firstGloss, kanjiMeanings)) {
            score += SCORE.EXACT_MATCH_CORE_MEANING_BONUS;
        }

        if (isObscure) {
            score += SCORE.EXACT_MATCH_OBSCURE_PENALTY;
        }
    }

    const isSingleKanji = written === targetKanji;
    const isKatakanaPron = KATAKANA_ONLY_RE.test(pron);

    if (isSingleKanji && isKatakanaPron) {
        score += SCORE.SINGLE_KANJI_KATAKANA_PENALTY;
    }

    return score;
}

function pickBestWordEntry(wordsJson, targetKanji, kanjiMeanings) {
    if (!Array.isArray(wordsJson)) {
        return null;
    }

    const candidates = [];

    for (const entry of wordsJson) {
        const variant = pickPrimaryVariant(entry?.variants);
        const meaning = pickPrimaryMeaning(entry?.meanings);

        const written = variant?.written;
        const pron = variant?.pronounced;
        const gloss = meaning?.glosses?.[0];

        if (!written || !pron || !gloss) {
            continue;
        }

        candidates.push({
            score: scoreEntry(entry, targetKanji, kanjiMeanings),
            written: String(written),
            pron: String(pron),
            gloss: String(gloss),
            text: `${written} （${pron}） - ${gloss}`,
        });
    }

    candidates.sort(compareCandidates);
    return candidates[0] || null;
}

function buildNotesFromWords(wordsJson, targetKanji, kanjiMeanings, max = 3) {
    if (!Array.isArray(wordsJson)) {
        return "";
    }

    const candidates = [];

    for (const entry of wordsJson) {
        const variant = pickPrimaryVariant(entry?.variants);
        const meaning = pickPrimaryMeaning(entry?.meanings);

        const written = variant?.written;
        const pron = variant?.pronounced;
        const gloss = meaning?.glosses?.[0];

        if (!written || !pron || !gloss) {
            continue;
        }

        candidates.push({ 
            score: scoreEntry(entry, targetKanji, kanjiMeanings),
            written: String(written),
            pron: String(pron),
            gloss: String(gloss),
            text: `${written} （${pron}） - ${gloss}`,
         });
    }

    candidates.sort(compareCandidates);

    const out = [];
    const seen = new Set();

    for (const c of candidates) {
        if (out.length >= max) {
            break;
        }

        const dedupeKey = `${c.written}|${c.pron}`;
        if (seen.has(dedupeKey)) {
            continue;
        }

        seen.add(dedupeKey);
        out.push(c.text);
    }

    return out.join(" ／ ");
}

function pickBestEnglishMeaning(meanings) {
    if (!Array.isArray(meanings) || meanings.length === 0) {
        return "";
    }

    const filtered = meanings
        .map((m) => String(m ?? "").trim())
        .filter(Boolean)
        .filter((m) => !/[0-9]/.test(m))
        .filter((m) => m.length <= 30)
        .filter((m) => !/[()]/.test(m));

    return filtered[0] || String(meanings[0] ?? "").trim();
}

function buildMeaningJP(bestWord, englishMeaning) {
    const jpHint = bestWord ? `${bestWord.written} （${bestWord.pron}）` : "";
    const en = String(englishMeaning ?? "").trim();

    if (jpHint && en) {
        return `${jpHint} ／ ${en}`;
    }

    return jpHint || en;
}

async function mapWithConcurrency(items, concurrency, mapper) {
    const results = new Array(items.length);
    let nextIndex = 0;

    async function worker() {
        while (true) {
            const currentIndex = nextIndex++;

            if (currentIndex >= items.length) {
                return;
            }

            results[currentIndex] = await mapper(items[currentIndex], currentIndex);
        }
    }

    const safeConcurrency = Math.max(1, Number(concurrency) || 1);
    const workerCount = Math.min(safeConcurrency, Math.max(1, items.length));

    await Promise.all(
        Array.from({ length: workerCount }, () => worker())
    );

    return results;
}

async function buildRowForKanji({
    kanji,
    kradMap, 
    pickMainComponent, 
    kanjiApiClient
}) {
    try {
        const [kInfo, words] = await Promise.all([
            kanjiApiClient.getKanji(kanji),
            kanjiApiClient.getWords(kanji),
        ]);

        const kanjiMeanings = Array.isArray(kInfo?.meanings) ? kInfo.meanings : [];
        const bestWord = pickBestWordEntry(words, kanji, kanjiMeanings);
        const notes = buildNotesFromWords(words, kanji, kanjiMeanings, 3);
        const englishMeaning = pickBestEnglishMeaning(kInfo?.meanings);
        const meaningJP = buildMeaningJP(bestWord, englishMeaning);
        const reading = labelReading(kInfo?.on_readings, kInfo?.kun_readings);

        const comps = kradMap.get(kanji) || [];
        const radical = pickMainComponent(comps);

        return [
            kanji,
            meaningJP,
            reading,
            "", // StrokeOrder blank
            radical,
            notes,
        ].map(tsvEscape).join("\t");
    } catch (error) {
        return [
            kanji,
            "",
            "",
            "",
            "",
            `ERROR: ${error instanceof Error ? error.message : String(error)}`,
        ].map(tsvEscape).join("\t");
    }
}

async function buildTsvForJlptLevel({
    levelNumber,        // 1-5
    jlptOnlyJson,       // object keyed by kanji
    kradMap,           // Map of kanji to components
    pickMainComponent, // function to pick main component from list
    kanjiApiClient,    // client with getKanji and getWords methods
    limit = null,             // optional limit on number of kanji to process
    concurrency = 8,          // how many kanji to process at once
}) {
    const header = [
        "Kanji",
        "MeaningJP",
        "Reading",
        "StrokeOrder",
        "Radical",
        "Notes",
    ].join("\t");

    const kanjiList = Object.entries(jlptOnlyJson)
        .filter(([, obj]) => obj?.jlpt === levelNumber)
        .map(([k]) => k);

    const list = (Number.isFinite(limit)) ? 
        kanjiList.slice(0, limit) : kanjiList;

    const rows = await mapWithConcurrency(
        list, 
        concurrency, 
        async (kanji) => buildRowForKanji({
            kanji,
            kradMap,
            pickMainComponent,
            kanjiApiClient,
        })
    );

    return [header, ...rows].join("\n");
}

module.exports = {
    buildTsvForJlptLevel,
    buildRowForKanji,
    buildNotesFromWords,
    buildMeaningJP,
    classifyGloss,
    compareCandidates,
    countKanjiChars,
    glossMatchesCoreMeaning,
    labelReading,
    mapWithConcurrency,
    normalizeGlosses,
    normalizeText,
    pickBestEnglishMeaning,
    pickBestWordEntry,
    pickPrimaryMeaning,
    pickPrimaryVariant,
    scoreEntry,
    tsvEscape,
};