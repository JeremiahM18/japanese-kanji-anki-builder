function normalizeText(value) {
    return String(value ?? "").trim().toLowerCase();
}

function normalizeGlosses(glosses) {
    return (Array.isArray(glosses) ? glosses : [])
        .map((gloss) => normalizeText(gloss))
        .filter(Boolean);
}

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

module.exports = {
    labelReading,
    normalizeGlosses,
    normalizeText,
    tsvEscape,
};
