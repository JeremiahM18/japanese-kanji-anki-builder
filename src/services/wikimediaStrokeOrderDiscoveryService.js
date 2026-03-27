const { URL } = require("node:url");

const COMMONS_API_URL = "https://commons.wikimedia.org/w/api.php";

function buildCommonsSearchUrl(query, limit = 10) {
    const url = new URL(COMMONS_API_URL);
    url.searchParams.set("action", "query");
    url.searchParams.set("list", "search");
    url.searchParams.set("srnamespace", "6");
    url.searchParams.set("srlimit", String(limit));
    url.searchParams.set("format", "json");
    url.searchParams.set("srsearch", query);
    return url.toString();
}

function buildSearchQueries(kanji) {
    return [
        `intitle:${kanji} order`,
        `intitle:${kanji} stroke order`,
        `intitle:${kanji} bw`,
    ];
}

function normalizeFileTitle(title) {
    return String(title || "").replace(/^File:/i, "").trim();
}

function scoreImageTitle(fileName, kanji) {
    const lower = String(fileName).toLowerCase();
    let score = 0;

    if (!lower.startsWith(String(kanji).toLowerCase())) {
        score -= 20;
    }

    if (lower.endsWith("-bw.png")) score += 120;
    if (lower.endsWith("-jbw.png")) score += 115;
    if (lower.endsWith("-red.png")) score += 80;
    if (lower.endsWith("-jred.png")) score += 75;
    if (lower.endsWith("-ired.png")) score += 70;
    if (lower.endsWith("-tred.png")) score += 65;
    if (lower.endsWith(".svg") && lower.includes("kanjivg stroke order")) score += 95;
    if (lower.includes("kaisho")) score -= 5;
    return score;
}

function scoreAnimationTitle(fileName, kanji) {
    const lower = String(fileName).toLowerCase();
    let score = 0;

    if (!lower.startsWith(String(kanji).toLowerCase())) {
        score -= 20;
    }

    if (lower.endsWith("-order.gif")) score += 120;
    if (lower.endsWith("-order.webp")) score += 100;
    return score;
}

function selectBestTitle(titles, scorer) {
    const ranked = titles
        .map((title) => ({ title, score: scorer(title) }))
        .filter((entry) => entry.score > 0)
        .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));

    return ranked.length > 0 ? ranked[0].title : null;
}

function buildCommonsFilePageUrl(fileName) {
    return `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(fileName)}`;
}

function buildCommonsRedirectUrl(fileName) {
    return `https://commons.wikimedia.org/wiki/Special:Redirect/file/${encodeURIComponent(fileName)}`;
}

async function discoverWikimediaStrokeOrderForKanji(kanji, { fetchJson, limit = 10 } = {}) {
    if (typeof fetchJson !== "function") {
        throw new Error("fetchJson is required");
    }

    const seen = new Set();
    const titles = [];

    for (const query of buildSearchQueries(kanji)) {
        const response = await fetchJson(buildCommonsSearchUrl(query, limit));
        const matches = response?.query?.search || [];

        for (const match of matches) {
            const fileName = normalizeFileTitle(match.title);
            if (!fileName || seen.has(fileName)) {
                continue;
            }

            seen.add(fileName);
            titles.push(fileName);
        }
    }

    const imageTitle = selectBestTitle(titles, (title) => scoreImageTitle(title, kanji));
    const animationTitle = selectBestTitle(titles, (title) => scoreAnimationTitle(title, kanji));
    const diagramTitle = selectBestTitle(titles, (title) => {
        const lower = String(title).toLowerCase();
        return lower.endsWith(".svg") && lower.includes("kanjivg stroke order") ? scoreImageTitle(title, kanji) : 0;
    });

    return {
        kanji,
        image: imageTitle ? {
            fileName: imageTitle,
            filePageUrl: buildCommonsFilePageUrl(imageTitle),
            downloadUrl: buildCommonsRedirectUrl(imageTitle),
        } : null,
        animation: animationTitle ? {
            fileName: animationTitle,
            filePageUrl: buildCommonsFilePageUrl(animationTitle),
            downloadUrl: buildCommonsRedirectUrl(animationTitle),
        } : null,
        diagram: diagramTitle ? {
            fileName: diagramTitle,
            filePageUrl: buildCommonsFilePageUrl(diagramTitle),
            downloadUrl: buildCommonsRedirectUrl(diagramTitle),
        } : null,
        titles,
    };
}

module.exports = {
    COMMONS_API_URL,
    buildCommonsSearchUrl,
    buildSearchQueries,
    discoverWikimediaStrokeOrderForKanji,
    normalizeFileTitle,
    scoreAnimationTitle,
    scoreImageTitle,
    selectBestTitle,
};
