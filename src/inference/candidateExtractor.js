const { normalizeGlosses, normalizeText } = require("../utils/text");

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

function glossText(entry) {
    return (entry?.meanings || [])
        .flatMap((meaning) => Array.isArray(meaning?.glosses) ? meaning.glosses : [])
        .map((gloss) => normalizeText(gloss))
        .filter(Boolean)
        .join(" ");
}

function classifyGloss(glosses) {
    const normalized = normalizeGlosses(glosses).join(" ");

    const isName =
        normalized.includes("surname") ||
        normalized.includes("given name") ||
        normalized.includes("place name") ||
        normalized.includes("person name");

    const isObscure =
        normalized.includes("chinese zodiac") ||
        normalized.includes("sexagenary cycle") ||
        normalized.includes("era name") ||
        normalized.includes("species of") ||
        normalized.includes("ancient china") ||
        normalized.includes("classical") ||
        normalized.includes("archaism");

    return {
        isName,
        isObscure,
    };
}

function extractWordCandidate(entry) {
    const variant = pickPrimaryVariant(entry?.variants);
    const meaning = pickPrimaryMeaning(entry?.meanings);

    const written = variant?.written;
    const pron = variant?.pronounced;
    const gloss = meaning?.glosses?.[0];

    if (!written || !pron || !gloss) {
        return null;
    }

    return {
        entry,
        variant,
        meaning,
        written: String(written),
        pron: String(pron),
        gloss: String(gloss),
        allGlossText: glossText(entry),
        text: `${written} （${pron}） - ${gloss}`,
    };
}

function extractWordCandidates(wordsJson) {
    if (!Array.isArray(wordsJson)) {
        return [];
    }

    return wordsJson
        .map((entry) => extractWordCandidate(entry))
        .filter(Boolean);
}

module.exports = {
    classifyGloss,
    extractWordCandidate,
    extractWordCandidates,
    glossText,
    pickPrimaryMeaning,
    pickPrimaryVariant,
};
