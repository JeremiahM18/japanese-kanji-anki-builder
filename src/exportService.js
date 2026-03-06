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

function isProbablyName(glosses) {
    const g = (glosses || []).join(" ").toLowerCase();
    return (
        g.includes("surname") || 
        g.includes("given name") || 
        g.includes("place name") || 
        g.includes("person name")
    );
}

function countKanjiChars(text){
    return Array.from(String(text || "")).filter((ch) => /\p{Script=Han}/u.test(ch)).length;
}

function glossText(entry) {
    return (entry?.meanings || [])
        .flatMap((m) => Array.isArray(m?.glosses) ? m.glosses : [])
        .join(" ")
        .toLowerCase();
}

function hasKanaOnly(text) {
    return /^[\p{Script=Hiragana}\p{Script=Katakana}ー]+$/u.test(String(text || ""));
}

function hasJapaneseParensNoise(text) {
    return /[(（].+[)）]/.test(String(text || ""));
}

function isObscureGloss(glosses) {
    const g = (glosses || []).join(" ").toLowerCase();

    return (
        g.includes("chinese zodiac") ||
        g.includes("sexagenary cycle") ||
        g.includes("era name") ||
        g.includes("species of") ||
        g.includes("surname") ||
        g.includes("given name") ||
        g.includes("place name") ||
        g.includes("person name") ||
        g.includes("ancient china") ||
        g.includes("classical") ||
        g.includes("archaism")
    );
}

function glossMatchesCoreMeaning(gloss, meanings) {
    const g = String(gloss || "").toLowerCase();
    const roots = Array.isArray(meanings) ? meanings.map((m) => String(m || "").toLocaleLowerCase()) : [];
    return roots.some((m) => m && (g.includes(m) || m.includes(g)));
}

function scoreEntry(entry, targetKanji, kanjiMeanings) {
    const v = entry?.variants?.[0];
    const m = entry?.meanings?.[0];

    if (!v?.written || !v?.pronounced || !m?.glosses?.length) {
        return -999;
    }

    const written = String(v.written);
    const pron = String(v.pronounced);
    const firstGloss = String(m.glosses[0] || "");
    const allGlossText = glossText(entry);

    let score = 0;

    // Prefer words that actually contain the target kanji
    if (written.includes(targetKanji)) {
        score += 20;
    } else {
        score -= 25;
    }

    // Prefer short, common-learning vocabulary
    const len = written.length;
    if (len === 1) {
        score += 8;
    } else if (len === 2) {
        score += 18;
    } else if (len === 3) {
        score += 12;
    } else if (len === 4) {
        score += 6;
    } else {
        score -= Math.min(12, len - 4);
    }
    
    // Prefer entries with priority markers (JLPT, common, etc)
    if (Array.isArray(v?.priorities)) {
        score += v.priorities.length * 5;
    }

    // Prefer simpler glosses
    if (firstGloss.length <= 18) {
        score += 6;
    } else if (firstGloss.length > 40) {
        score -= 6;
    }
    
    // Penalize noisy / obsecure dictionary entries
    if (isProbablyName(m?.glosses)) {
        score -= 20;
    }

    if (isObscureGloss(m.glosses)) {
        score -= 25;
    }

    // Avoid romaji/number junk entries
    if (/^[A-Za-z0-9]+$/.test(v.written)) {
        score -= 20;
    }

    if (hasJapaneseParensNoise(firstGloss)) {
        score -= 8;
    }

    // Prefer words with a reasonable kanji footprint
    const kanjiCount = countKanjiChars(written);
    if (kanjiCount >= 1 && kanjiCount <= 2) {
        score += 5;
    } else if (kanjiCount >= 4) {
        score -= 6;
    }

    // Penalize kana-only items for the "main" anchor word
    if (hasKanaOnly(written)) {
        score -= 10;
    }

    // Bonus if the gloss feels close to the core kanji meaning
    if (glossMatchesCoreMeaning(firstGloss, kanjiMeanings)) {
        score += 12;
    }

    // Penalize very obsecure-looking long compounds
    if (allGlossText.includes("term of the sexagenary cycle")) {
        score -= 40;
    }

    if (allGlossText.includes("species of")) {
        score -= 30;
    }

    // Prefer entries where pronunciation is not absurdly long
    if (pron.length >= 8) {
        score -= 4;
    }

    // Bonus
    if (written === targetKanji) {
        score += 18;
    }

    return score;
}

function pickBestWordEntry(wordsJson, targetKanji, kanjiMeanings) {
    if (!Array.isArray(wordsJson)) {
        return null;
    }

    const candidates = [];

    for (const entry of wordsJson) {
        const v = entry?.variants?.[0];
        const m = entry?.meanings?.[0];

        const written = v?.written;
        const pron = v?.pronounced;
        const gloss = m?.glosses?.[0];

        if (!written || !pron || !gloss) {
            continue;
        }

        candidates.push({
            score: scoreEntry(entry, targetKanji, kanjiMeanings),
            written,
            pron,
            gloss,
            text: `${written} (${pron}) - ${gloss}`,
        });
    }

    candidates.sort((a, b) => b.score - a.score);
    return candidates[0] || null;
}

function buildNotesFromWords(wordsJson, targetKanji, kanjiMeanings, max = 3) {
    if (!Array.isArray(wordsJson)) {
        return "";
    }

    const candidates = [];

    for (const entry of wordsJson) {
        const v = entry?.variants?.[0];
        const m = entry?.meanings?.[0];

        const written = v?.written;
        const pron = v?.pronounced;
        const gloss = m?.glosses?.[0];

        if (!written || !pron || !gloss) {
            continue;
        }

        candidates.push({ 
            score: scoreEntry(entry, targetKanji, kanjiMeanings),
            text: `${written} （${pron}） - ${gloss}`,
         });
    }

    candidates.sort((a, b) => b.score - a.score);

    const out = [];
    const seen = new Set();

    for (const c of candidates) {
        if (out.length >= max) {
            break;
        }
        if (seen.has(c.text)) {
            continue;
        }

        seen.add(c.text);
        out.push(c.text);
    }

    return out.join(" / ");
}

function pickBestEnglishMeaning(meanings) {
    if (!Array.isArray(meanings) || meanings.length === 0) {
        return "";
    }

    const filtered = meanings
        .map((m) => String(m || "").trim())
        .filter(Boolean)
        .filter((m) => !/[0-9]/.test(m))
        .filter((m) => m.length <= 30);

    return filtered[0] || String(meanings[0] || "").trim();
}

function buildMeaningJP(bestWord, englishMeaning) {
    const jpHint = bestWord ? `${bestWord.written} （${bestWord.pron}）` : "";
    const en = englishMeaning || "";

    if (jpHint && en) {
        return `${jpHint} / ${en}`;
    }

    return jpHint || en;
}

async function mapWithConcurrency(items, concurrency, mapper) {
    const results = new Array(items.length);
    let nextIndex = 0;

    async function worker() {
        while (true) {
            const currentIndex = nextIndex;
            nextIndex++;

            if (currentIndex >= items.length) {
                return
            }

            results[currentIndex] = await mapper(items[currentIndex], currentIndex);
        }
    }

    const workerCount = Math.max(1, Math.min(concurrency, items.length));
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

    const list = (limit && Number.isFinite(limit)) ? 
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
};