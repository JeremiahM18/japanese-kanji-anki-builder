function normalizeText(value) {
    return String(value ?? "").trim().toLowerCase();
}

function compareStableStrings(left, right) {
    const leftChars = Array.from(String(left ?? ""));
    const rightChars = Array.from(String(right ?? ""));
    const sharedLength = Math.min(leftChars.length, rightChars.length);

    for (let index = 0; index < sharedLength; index += 1) {
        const diff = leftChars[index].codePointAt(0) - rightChars[index].codePointAt(0);
        if (diff !== 0) {
            return diff;
        }
    }

    return leftChars.length - rightChars.length;
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

function decodeHtmlEntities(value) {
    const entityMap = {
        amp: "&",
        lt: "<",
        gt: ">",
        quot: "\"",
        "#39": "'",
    };

    return String(value ?? "").replace(/&(?:amp|lt|gt|quot|#39);/giu, (entity) => {
        const key = entity.slice(1, -1).toLowerCase();
        return entityMap[key] || entity;
    });
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
    compareStableStrings,
    decodeHtmlEntities,
    escapeHtml,
    labelKunReading,
    labelOnReading,
    labelReading,
    normalizeGlosses,
    normalizeText,
    sanitizeRubyMarkup,
    tsvEscape,
};

