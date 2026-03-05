function tsvEscape(s) {
    return String(s ?? "")
    .replace(/\t/g, " ")
    .replace(/\n/g, " ")
    .trim();
}

function labelReading(onArr, kunArr) {
    const on = Array.isArray(onArr) && onArr.length ? `オン: ${onArr.join("、 ")}` : "";
    const kun = Array.isArray(kunArr) && kunArr.length ? `くん: ${kunArr.join("、 ")}` : "";
    return [on, kun].filter(Boolean).join(" | ");
}

function buildNotesFromWords(wordsJson, max = 3) {
    if (!Array.isArray(wordsJson)) return "";

    const out = [];
    for (const word of wordsJson) {
        if (out.length >= max) break;

        const v = entry?.variants?.[0];
        const m = word?.meanings?.[0];
        const written = v?.written;
        const pron = v?.pronounced;
        const gloss = m?.glosses?.[0];

        if (!written || !pron || !gloss) continue;

        out.push(`${written} [${pron}]: ${gloss}`);
    }
    return out.join(" ／ ");
}

function buildMeaningJP(firstExampleNotes, englishMeaning) {
    const jpHint = firstExampleNotes ? firstExampleNotes.split(" - ")[0] : "";
    const en = englishMeaning || "";
    if (jpHint && en) {
        return `${jpHint} / ${en}`;
    }
    return jpHint || en;
}

async function buildTsvForJlptLevel({
    levelNumber,        // 1-5
    jlptOnlyJson,       // object keyed by kanji
    kradMap,           // Map of kanji to components
    pickMainComponent, // function to pick main component from list
    kanjiApiClient,    // client with getKanji and getWords methods
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

    const lines = [header];

    for (const kanji of kanjiList) {
        const kInfo = await kanjiApiClient.getKanji(kanji);
        const words = await kanjiApiClient.getWords(kanji);

        const notes = buildNotesFromWords(words, 3);
        const firstExample = notes ? notes.split(" / ")[0] : "";
        const englishMeaning = Array.isArray(kInfo?.meanings) ? kInfo.meanings[0] : "";

        const meaningJP = buildMeaningJP(firstExample, englishMeaning);
        const reading = labelReading(kInfo?.on_readings, kInfo?.kun_readings);

        const comps = kradMap.get(kanji) || [];
        const radical = pickMainComponent(comps);

        const row = [
            kanji,
            meaningJP,
            reading,
            "", // StrokeOrder blank
            radical,
            notes,
        ].map(tsvEscape).join("\t");

        lines.push(row);
    }

    return lines.join("\n");
}

module.exports = {
    buildTsvForJlptLevel,
};