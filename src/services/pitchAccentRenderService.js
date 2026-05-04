const SMALL_KANA = new Set(Array.from("ゃゅょぁぃぅぇぉゎャュョァィゥェォヮ"));

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function splitMoras(reading) {
    const moras = [];
    for (const char of Array.from(String(reading || "").trim())) {
        if (!char) {
            continue;
        }
        if (SMALL_KANA.has(char) && moras.length > 0) {
            moras[moras.length - 1] += char;
            continue;
        }
        moras.push(char);
    }
    return moras;
}

function parsePitchAccentPattern(pattern) {
    return [...new Set(
        String(pattern || "")
            .match(/\d+/g)
            ?.map((value) => Number(value))
            .filter((value) => Number.isInteger(value) && value >= 0) || []
    )];
}

function stripHtmlTags(value) {
    return String(value || "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function extractRenderedPitchAccentPattern(value) {
    const text = String(value || "");
    const ariaMatches = [...text.matchAll(/aria-label=["']Pitch\s+\d+\s*:\s*(\d+)["']/giu)]
        .map((match) => Number(match[1]))
        .filter((accent) => Number.isInteger(accent) && accent >= 0);

    if (ariaMatches.length > 0) {
        return ariaMatches;
    }

    if (/pitch-accent-visual|pitch-contour/iu.test(text)) {
        return [];
    }

    return parsePitchAccentPattern(stripHtmlTags(text));
}

function getPitchLevels({ accent, moraCount }) {
    if (!Number.isInteger(accent) || accent < 0 || moraCount <= 0) {
        return [];
    }

    const levels = [];
    for (let index = 0; index < moraCount; index += 1) {
        const position = index + 1;
        let high = false;

        if (accent === 0) {
            high = position > 1;
        } else if (accent === 1) {
            high = position === 1;
        } else {
            high = position > 1 && position <= accent;
        }

        levels.push(high ? "high" : "low");
    }

    const trailingParticleLevel = accent === 0 ? "high" : "low";
    return [...levels, trailingParticleLevel];
}

function buildPitchAccentSvg({ accent, moras }) {
    const moraList = Array.isArray(moras) ? moras : [];
    const levels = getPitchLevels({ accent, moraCount: moraList.length });
    if (moraList.length === 0 || levels.length === 0) {
        return "";
    }

    const pointSpacing = 30;
    const leftPadding = 16;
    const topPadding = 8;
    const labelTop = 58;
    const highY = topPadding + 8;
    const lowY = topPadding + 34;
    const width = leftPadding * 2 + pointSpacing * moraList.length;
    const height = 78;
    const points = levels.map((level, index) => ({
        x: leftPadding + pointSpacing * index,
        y: level === "high" ? highY : lowY,
    }));
    const polyline = points.map((point) => `${point.x},${point.y}`).join(" ");
    const circles = points.map((point, index) => {
        const isTrailingParticle = index === points.length - 1;
        const fill = isTrailingParticle ? "#ffffff" : "#111111";
        const stroke = "#111111";
        return `<circle cx="${point.x}" cy="${point.y}" r="5" fill="${fill}" stroke="${stroke}" stroke-width="2.5"/>`;
    }).join("");
    const labels = moraList.map((mora, index) => (
        `<text x="${points[index].x}" y="${labelTop}" text-anchor="middle" class="pitch-mora">${escapeHtml(mora)}</text>`
    )).join("");

    return [
        `<svg class="pitch-contour" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Pitch accent contour ${accent}" xmlns="http://www.w3.org/2000/svg">`,
        `<polyline points="${polyline}" fill="none" stroke="#111111" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`,
        circles,
        labels,
        "</svg>",
    ].join("");
}

function buildPitchAccentHtml({ pattern, reading, sourceLabel = "" }) {
    const trimmedPattern = String(pattern || "").trim();
    const moras = splitMoras(reading);
    const accents = parsePitchAccentPattern(trimmedPattern);
    const trimmedSourceLabel = String(sourceLabel || "").trim();
    if (!trimmedPattern) {
        return "";
    }

    if (moras.length === 0 || accents.length === 0) {
        return "";
    }

    const diagrams = accents.map((accent, index) => [
        `<div class="pitch-diagram" aria-label="Pitch ${index + 1}: ${accent}">`,
        accents.length > 1 ? `<div class="pitch-diagram-title">Pitch ${index + 1}</div>` : "",
        buildPitchAccentSvg({ accent, moras }),
        "</div>",
    ].join("")).join("");

    return [
        "<div class=\"pitch-accent-visual\">",
        diagrams,
        trimmedSourceLabel
            ? `<div class="pitch-source-label">${escapeHtml(trimmedSourceLabel)}</div>`
            : "",
        "</div>",
    ].join("");
}

module.exports = {
    buildPitchAccentHtml,
    buildPitchAccentSvg,
    escapeHtml,
    extractRenderedPitchAccentPattern,
    getPitchLevels,
    parsePitchAccentPattern,
    splitMoras,
};
