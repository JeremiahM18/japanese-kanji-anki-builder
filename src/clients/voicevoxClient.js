const { URL } = require("node:url");

function normalizeBaseUrl(baseUrl) {
    const normalized = String(baseUrl || "").trim();
    if (!normalized) {
        throw new Error("VOICEVOX engine URL is required.");
    }

    return normalized.endsWith("/") ? normalized : `${normalized}/`;
}

function buildUrl(baseUrl, pathname, query = {}) {
    const url = new URL(pathname.replace(/^\//, ""), normalizeBaseUrl(baseUrl));

    for (const [key, value] of Object.entries(query)) {
        if (value == null || value === "") {
            continue;
        }

        url.searchParams.set(key, String(value));
    }

    return url.toString();
}

async function parseJsonResponse(response) {
    const text = await response.text();

    if (!response.ok) {
        throw new Error(`VOICEVOX request failed (${response.status} ${response.statusText}): ${text}`.trim());
    }

    try {
        return JSON.parse(text);
    } catch (error) {
        throw new Error(`VOICEVOX returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
}

function createVoicevoxClient({
    baseUrl,
    fetchImpl = fetch,
}) {
    async function listSpeakers() {
        const response = await fetchImpl(buildUrl(baseUrl, "/speakers"));
        return parseJsonResponse(response);
    }

    async function createAudioQuery({ text, speakerId }) {
        const response = await fetchImpl(buildUrl(baseUrl, "/audio_query", {
            text,
            speaker: speakerId,
        }), {
            method: "POST",
        });

        return parseJsonResponse(response);
    }

    async function synthesize({ text, speakerId }) {
        const audioQuery = await createAudioQuery({ text, speakerId });
        const response = await fetchImpl(buildUrl(baseUrl, "/synthesis", {
            speaker: speakerId,
        }), {
            method: "POST",
            headers: {
                "content-type": "application/json",
            },
            body: JSON.stringify(audioQuery),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`VOICEVOX synthesis failed (${response.status} ${response.statusText}): ${errorText}`.trim());
        }

        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
    }

    return {
        createAudioQuery,
        listSpeakers,
        synthesize,
    };
}

module.exports = {
    buildUrl,
    createVoicevoxClient,
    normalizeBaseUrl,
    parseJsonResponse,
};
