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

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function sanitizeRubyMarkup(value) {
    const source = String(value ?? "");
    const allowedTagRe = /<\/?(?:ruby|rt)>/giu;
    const parts = [];
    let cursor = 0;
    let match;

    while ((match = allowedTagRe.exec(source)) !== null) {
        parts.push(escapeHtml(source.slice(cursor, match.index)));
        parts.push(match[0].toLowerCase());
        cursor = match.index + match[0].length;
    }

    parts.push(escapeHtml(source.slice(cursor)));
    return parts.join("").trim();
}

function labelOnReading(onArr) {
    return Array.isArray(onArr) && onArr.length ? onArr.join("、 ") : "";
}

function labelKunReading(kunArr) {
    return Array.isArray(kunArr) && kunArr.length ? kunArr.join("、 ") : "";
}

function labelReading(onArr, kunArr) {
    const on = labelOnReading(onArr);
    const kun = labelKunReading(kunArr);
    return [on, kun].filter(Boolean).join(" ／ ");
}

module.exports = {
    escapeHtml,
    labelKunReading,
    labelOnReading,
    labelReading,
    normalizeGlosses,
    normalizeText,
    sanitizeRubyMarkup,
    tsvEscape,
};

