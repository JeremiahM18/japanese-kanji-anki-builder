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

function scoreEntry(entry) {
    const v = entry?.variants?.[0];
    const m = entry?.meanings?.[0];

    if (!v?.written || !v?.pronounced || !m?.glosses?.length) {
        return -999;
    }

    // Prefer 2-4 character words, which are more likely to be common vocabulary
    const len = v.written.length;
    const lenScore = (len >= 2 && len <= 4) ? 7 : (len === 1 ? 2 : Math.max(0, 6 - (len - 4)));

    // Prefer entries with "priorities" (JLPT, common, etc)
    const priorScore = Array.isArray(v?.priorities) ? v.priorities.length * 4 : 0;
    
    // Avoid names
    const namePenalty = isProbablyName(m?.glosses) ? -12 : 0;

    // Avoid romaji/number junk entries
    const junkPenalty = /^[A-Za-z0-9]+$/.test(v.written) ? -12 : 0;

    return lenScore + priorScore + namePenalty + junkPenalty;
}

function buildNotesFromWords(wordsJson, max = 3) {
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
            score: scoreEntry(entry),
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

function buildMeaningJP(firstExampleNotes, englishMeaning) {
    const jpHint = firstExampleNotes ? firstExampleNotes.split(" - ")[0] : "";
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
    await Promise.all(Array.from({ length: workerCount }, () => worker));

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

    const notes = buildNotesFromWords(words, 3);
    const firstExample = notes ? notes.split(" / ")[0] : "";
    const englishMeaning = Array.isArray(kInfo?.meanings) ? kInfo.meanings[0] : "";
    const meaningJP = buildMeaningJP(firstExample, englishMeaning);
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
        concurrency, async (kanji) => buildRowForKanji({
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